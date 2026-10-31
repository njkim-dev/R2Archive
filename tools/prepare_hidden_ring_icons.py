import argparse
import hashlib
import io
import json
from pathlib import Path

from prepare_shop import load_image,write_json


def build(game,shop,revision):
    folder=shop/'catalogs'/revision;plan=json.loads((folder/'plan.json').read_text(encoding='utf8'));catalog=json.loads((folder/'catalog.json').read_text(encoding='utf8'))
    target=shop/'assets'/revision/'thumbnails';target.mkdir(parents=True,exist_ok=True);updates=[];files=[]
    best_friends=set(json.loads((Path(__file__).resolve().parents[1]/'backend/data/shop_category_items.json').read_text(encoding='utf8'))['items']['best_friend'])
    for item in plan['items']:
        if item['show'] or not (item['category']=='507' or item['category']=='508' and item['id'] not in best_friends):continue
        source=game/item['_thumbnail_source'];image=load_image(source);image.thumbnail((256,256));out=io.BytesIO();image.save(out,format='WEBP',lossless=True,method=3);data=out.getvalue();digest=hashlib.sha256(data).hexdigest();name=digest+'.webp';path=target/name
        if not path.exists():path.write_bytes(data)
        files.append({'relative_path':path.relative_to(shop).as_posix(),'sha256':digest,'size':len(data)})
        updates.append({'id':item['id'],'thumbnail':name,'source':item['_thumbnail_source']})
    lookup={row['id']:row['thumbnail'] for row in updates}
    for item in catalog['items']:
        if item['id'] in lookup:item['thumbnail']=lookup[item['id']]
    write_json(folder/'catalog.json',catalog)
    write_json(shop/'hidden-ring-assets.json',{'revision':revision,'files':files,'updates':updates})
    print(json.dumps({'hidden_ring_icons':len(updates),'bytes':sum(row['size'] for row in files)}))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--game-root',type=Path,required=True);parser.add_argument('--shop-root',type=Path,required=True);parser.add_argument('--revision',required=True);args=parser.parse_args();build(args.game_root,args.shop_root,args.revision)
