"""Evaluate CPU candidate retrieval using recorded regions; this does not call OpenAI."""
import argparse
from collections import Counter
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys
import time

import numpy as np
from PIL import Image, ImageEnhance

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from shop_image_search import decode_image
from shop_outfit_search import outfit_engine, RETRIEVAL_VERSION, valid_region

VARIANTS = ('original','jpeg35','jpeg70','scale50','scale75','scale150','dim75','bright125',
            'saturation65','warm','outline-left','outline-right','outline-jitter',
            'jpeg50','scale60','dim85','bright110','saturation80')


def load_cases(path):
    cases = json.loads(path.read_text(encoding='utf-8-sig'))['cases']
    groups, names = {}, set()
    if not cases:
        raise ValueError('At least one labelled case is required')
    for row in cases:
        if row['name'] in names or row['split'] not in ('development','validation'):
            raise ValueError('Case names must be unique and split must be development or validation')
        names.add(row['name'])
        group = row['source_group']
        if not isinstance(group,str) or not group or groups.setdefault(group,row['split']) != row['split']:
            raise ValueError('Variants of one source photograph must remain in the same split')
        if row['sex'] not in ('female','male') or row['slot'] not in ('hair','top','bottom','shoes'):
            raise ValueError('Invalid character sex or slot')
        if not isinstance(row['expected_ids'],list) or not row['expected_ids']:
            raise ValueError('Verified expected item IDs are required')
        row['expected_ids'] = [str(item) for item in row['expected_ids']]
        image = Path(row['image'])
        row['image'] = image if image.is_absolute() else path.parent/image
        valid_region(row['region'],(1000,1000))
    return cases


def transform(source, region, variant):
    if variant not in VARIANTS:
        raise ValueError('Unknown image variant')
    image = source.copy()
    info = json.loads(json.dumps(region))
    if variant.startswith('jpeg'):
        stream = BytesIO();image.save(stream,format='JPEG',quality=int(variant[4:]))
        with Image.open(BytesIO(stream.getvalue())) as encoded:
            image = encoded.convert('RGB')
    elif variant.startswith('scale'):
        scale = int(variant[5:])/100
        image = image.resize((max(16,round(image.width*scale)),max(16,round(image.height*scale))),Image.Resampling.BICUBIC)
    elif variant.startswith('dim') or variant.startswith('bright'):
        image = ImageEnhance.Brightness(image).enhance(int(variant[3:] if variant.startswith('dim') else variant[6:])/100)
    elif variant.startswith('saturation'):
        image = ImageEnhance.Color(image).enhance(int(variant[10:])/100)
    elif variant=='warm':
        image = Image.fromarray(np.clip(np.asarray(image)*np.array([1.08,.94,.88]),0,255).astype(np.uint8))
    elif variant.startswith('outline'):
        rng = np.random.default_rng(20261103)
        points = []
        for x,y in info['polygon_xy']:
            dx,dy = (-10,0) if variant=='outline-left' else (10,0) if variant=='outline-right' else rng.integers(-10,11,2)
            points.append([int(np.clip(x+dx,0,1000)),int(np.clip(y+dy,0,1000))])
        info['polygon_xy'] = points
        info['bbox_xyxy'] = [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)]
    valid_region(info,image.size)
    return image,info


def summarize(results):
    summary = {}
    for split in ('all','development','validation'):
        selected = [row for row in results if split=='all' or row['split']==split]
        summary[split] = {'queries':len(selected),'source_groups':len({row['source_group'] for row in selected}),
                          'hits':{str(k):sum(row['rank'] is not None and row['rank']<=k for row in selected) for k in (1,5,20,120)},
                          'misses_by_variant':dict(Counter(row['variant'] for row in selected if row['rank'] is None))}
    return summary


def compare(reference, report):
    if any(reference.get(key)!=report.get(key) for key in ('stage','catalog_revision','encoder_sha256')):
        raise ValueError('Reference must use the same retrieval stage, catalogue and encoder')
    old = {(row['case'],row['variant']):row for row in reference['cases']}
    new = {(row['case'],row['variant']):row for row in report['cases']}
    if old.keys()!=new.keys():
        raise ValueError('Reference cases and variants must match')
    changes = {'rescued':[],'regressions':[]}
    for key,row in new.items():
        before = old[key]
        if any(row[field]!=before[field] for field in ('source_group','split','sex','slot','input_sha256','expected_ids')):
            raise ValueError('Reference inputs, labels and source splits must match')
        item = {'case':key[0],'variant':key[1],'source_group':row['source_group'],'split':row['split']}
        if before['rank'] is None and row['rank'] is not None:
            changes['rescued'].append(item)
        elif before['rank'] is not None and row['rank'] is None:
            changes['regressions'].append(item)
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cases',type=Path,required=True,help='Private JSON manifest containing labelled cases and recorded regions')
    parser.add_argument('--report',type=Path,required=True)
    parser.add_argument('--reference',type=Path)
    parser.add_argument('--baseline-colors',action='store_true',help='Use the preceding single-color-view candidate algorithm')
    parser.add_argument('--variants',default=','.join(VARIANTS))
    args = parser.parse_args()
    variants = list(dict.fromkeys(args.variants.split(',')))
    if not variants or any(value not in VARIANTS for value in variants):
        parser.error('Unknown image variant')
    cases = load_cases(args.cases)
    model = outfit_engine();allowed = {str(row['id']):row for row in model.rows}
    results = [];started = time.perf_counter()
    for case in cases:
        for item in case['expected_ids']:
            if item not in allowed or allowed[item]['slot']!=case['slot'] or allowed[item]['sex'] not in (case['sex'],'common'):
                raise ValueError('Expected item must belong to the current catalogue, sex and slot')
        source = decode_image(case['image'].read_bytes())
        for variant in variants:
            image,region = transform(source,case['region'],variant)
            signature = sha256(image.tobytes()+json.dumps({'size':image.size,'region':region},sort_keys=True).encode()).hexdigest()
            start = time.perf_counter()
            candidates,_,_ = model.shortlist(image,region,case['sex'],case['slot'],allowed,augment_colors=not args.baseline_colors)
            ids = [str(row['id']) for row in candidates]
            rank = min((ids.index(item)+1 for item in case['expected_ids'] if item in ids),default=None)
            results.append({'case':case['name'],'variant':variant,'source_group':case['source_group'],'split':case['split'],
                            'sex':case['sex'],'slot':case['slot'],'input_sha256':signature,'expected_ids':case['expected_ids'],
                            'rank':rank,'candidate_ids':ids,'cpu_seconds':round(time.perf_counter()-start,4)})
        print(json.dumps({'case':case['name'],'queries':len(results)},ensure_ascii=True),flush=True)
    report = {'stage':'cpu-candidates-with-recorded-regions','openai_calls':0,'catalog_revision':model.revision,
              'encoder_sha256':model.encoder_sha256,'retrieval_version':RETRIEVAL_VERSION,'augmented_colors':not args.baseline_colors,
              'variants':variants,'seconds':round(time.perf_counter()-started,3),'summary':summarize(results),'cases':results}
    if args.reference:
        report['comparison'] = compare(json.loads(args.reference.read_text(encoding='utf-8-sig')),report)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'summary':report['summary'],'comparison':report.get('comparison'),'seconds':report['seconds']},ensure_ascii=True),flush=True)


if __name__=='__main__':
    main()
