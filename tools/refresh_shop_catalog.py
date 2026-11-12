import argparse
import copy
import hashlib
import io
import json
from pathlib import Path

from prepare_shop import Resolver,SCRIPT_FILES,load_catalog,load_image,write_json


METADATA=('name','name_key','category','sex','show','description','prices','attributes')


def merge_items(previous,current,thumbnails=None,reviewed_pairs=()):
    old={int(item['id']):item for item in previous}
    ids={int(item['id']) for item in current}
    if len(ids)!=len(current) or not set(old)<=ids:
        raise ValueError('Duplicate or removed item IDs require review before publication')
    merged=[]
    for order,row in enumerate(current):
        item=copy.deepcopy(old.get(int(row['id']),{key:value for key,value in row.items() if not key.startswith('_')}))
        item.update({key:copy.deepcopy(row[key]) for key in METADATA})
        if row.get('slot') is not None:item['slot']=row['slot']
        item['sort_order']=order
        if row.get('counterpart_id') is not None:item['counterpart_id']=row['counterpart_id']
        if thumbnails and int(row['id']) in thumbnails:item['thumbnail']=thumbnails[int(row['id'])]
        item.pop('sort',None)
        merged.append(item)
    lookup={int(item['id']):item for item in merged}
    for male_id,female_id in reviewed_pairs:
        male,female=lookup[int(male_id)],lookup[int(female_id)]
        if male['sex']!='male' or female['sex']!='female' or not male.get('slot') or male['slot']!=female.get('slot') or (int(male['category'])<300)!=(int(female['category'])<300):
            raise ValueError('Reviewed counterparts must have matching slots and character families')
        male['counterpart_id'],female['counterpart_id']=female['id'],male['id']
    return merged


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--shop-root',type=Path,required=True)
    parser.add_argument('--parent',required=True)
    parser.add_argument('--pairs',type=Path)
    parser.add_argument('--raw-plan',type=Path)
    parser.add_argument('--image-root',type=Path)
    parser.add_argument('--report',type=Path,required=True)
    args=parser.parse_args()
    shop=args.shop_root.resolve();previous=json.loads((shop/'catalogs'/args.parent/'catalog.json').read_text(encoding='utf8'))
    if args.raw_plan:current=json.loads(args.raw_plan.read_text(encoding='utf8'))
    else:
        current,_=load_catalog(args.source.resolve(),Resolver(args.source.resolve(),shop/'pose-input'))
        write_json(args.report.parent/'raw-plan.json',current)
    pairs=json.loads(args.pairs.read_text(encoding='utf8')) if args.pairs else []
    old={int(item['id']):item for item in previous['items']}
    changed=[row for row in current if int(row['id']) not in old or any(row.get(key)!=old[int(row['id'])].get(key) for key in METADATA)]
    images={};image_names={};source_files=[{'relative_path':name,'sha256':hashlib.sha256((args.source/name).read_bytes()).hexdigest(),'size':(args.source/name).stat().st_size} for name in SCRIPT_FILES]
    for row in changed:
        relative=row.get('_thumbnail_source')
        if not relative:continue
        source=(args.image_root/relative if args.image_root else None)
        if source is None or not source.is_file():source=args.source/relative
        image=load_image(source);image.thumbnail((256,256));stream=io.BytesIO();image.save(stream,format='WEBP',lossless=True,method=3);data=stream.getvalue();name=hashlib.sha256(data).hexdigest()+'.webp'
        images[name]=data;image_names[int(row['id'])]=name
        source_files.append({'relative_path':relative,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'size':source.stat().st_size})
    merged=merge_items(previous['items'],current,image_names,pairs)
    fingerprint=json.dumps({'schema':'shop-metadata-refresh-v1','parent':args.parent,'items':merged,'source_files':source_files},ensure_ascii=False,separators=(',',':'),sort_keys=True).encode()
    revision=hashlib.sha256(fingerprint).hexdigest()[:20]
    folder=shop/'catalogs'/revision;assets=shop/'assets'/revision
    payload={'revision':revision,'parent_revision':args.parent,'bases':previous['bases'],'items':merged}
    target=folder/'catalog.json'
    if target.exists() and json.loads(target.read_text(encoding='utf8'))!=payload:raise ValueError('Immutable catalog already exists with different content')
    for name,data in images.items():
        path=assets/'thumbnails'/name;path.parent.mkdir(parents=True,exist_ok=True)
        if path.exists() and path.read_bytes()!=data:raise ValueError('Asset hash collision')
        path.write_bytes(data)
    write_json(assets/'parent.json',{'schema':'shop-assets-parent-v1','revision':args.parent})
    write_json(target,payload)
    write_json(folder/'source-manifest.json',{'schema':'shop-metadata-refresh-v1','revision':revision,'parent_revision':args.parent,'files':source_files})
    released=[row for row in merged if row['show'] and not old.get(int(row['id']),{}).get('show')]
    report={'revision':revision,'parent_revision':args.parent,'items':len(merged),'visible':sum(row['show'] for row in merged),'changed':len(changed),'added':sum(int(row['id']) not in old for row in merged),'released':[{'id':row['id'],'name':row['name'],'sex':row['sex'],'slot':row.get('slot'),'preview_available':row['preview_available']} for row in released],'reviewed_pairs':pairs,'asset_bytes':sum(map(len,images.values()))}
    write_json(args.report,report)
    print(json.dumps(report,ensure_ascii=False),flush=True)


if __name__=='__main__':main()
