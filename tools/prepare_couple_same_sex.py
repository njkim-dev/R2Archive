import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np

from prepare_shop import Builder, bone_worlds, write_json
from shop_pose import couple_actor_side, couple_scene_pose, local_pose, read_animation


def build(game,shop):
    path=shop/'couple-catalog.json';catalog=json.loads(path.read_text(encoding='utf8'))
    manifest=json.loads((shop/'catalogs'/catalog['base_catalog']/'source-manifest.json').read_text(encoding='utf8'))
    builder=Builder(Path(manifest['snapshot_root']),shop,manifest)
    ids=['30855','30854','30846'];source={}
    digest=hashlib.sha256(Path(__file__).read_bytes())
    for item in ids:
        source[item]={}
        for sex,actor in [('male','boy'),('female','girl')]:
            source[item][sex]={}
            for side,letter in [('left','l'),('right','r'),('default','')]:
                p=game/'rnr_room_fx'/f'cp{item}_{letter}{actor}.ani'
                digest.update(p.read_bytes());source[item][sex][side]=read_animation(p)
    digest.update(json.dumps(manifest['pose_times'],sort_keys=True).encode())
    for sex in ['male','female']:
        for world in bone_worlds(builder.bases[sex],builder.bases[sex],builder.poses[sex]).values():digest.update(world.tobytes())
    revision=digest.hexdigest()[:20];folder=shop/'assets'/revision/'motions';folder.mkdir(parents=True,exist_ok=True)
    files=[]
    for item in ids:
        record=catalog['rings'][item]
        with gzip.open(shop/'assets'/catalog['revision']/'motions'/record['motion'],'rt',encoding='utf8') as f:legacy=json.load(f)
        record['same_sex']={};record['actor_roles']={}
        for sex,clips in source[item].items():
            primary=couple_actor_side(clips['default'],{k:v for k,v in clips.items() if k!='default'},'left' if sex=='male' else 'right')
            record['actor_roles'][sex]=primary
            base=builder.bases[sex];names=[b['name'] for b in base['bones']]
            static=bone_worlds(base,base,builder.poses[sex]);inverse={name:np.linalg.inv(static[name]) for name in names}
            payload={'schema':legacy['schema'],'duration':legacy['duration'],'frame_count':legacy['frame_count'],'bases':legacy['bases'],'actor_sexes':{'a':sex,'b':sex},'actors':{}}
            for actor,side in [('a',primary),('b','right' if primary=='left' else 'left')]:
                clip=clips[side];matrices=[];scene=np.array(couple_scene_pose(side,sex))
                for frame in range(payload['frame_count']):
                    time=clip['duration']*frame/payload['frame_count']
                    locals_={bone['name']:np.array(local_pose(clip['tracks'][bone['name']],bone['matrix'],time)) for bone in base['bones'] if bone['name'] in clip['tracks']}
                    worlds=bone_worlds(base,base,{'locals':locals_,'floor_offset':builder.poses[sex]['floor_offset']})
                    for name in names:matrices.extend(np.round(inverse[name]@worlds[name]@scene,6).ravel().tolist())
                if not np.isfinite(matrices).all():raise ValueError('Invalid actor matrices')
                payload['actors'][actor]={'bones':names,'frames':matrices,'extras':{},'side':side,'source_duration':clip['duration']}
            raw=json.dumps(payload,separators=(',',':'),allow_nan=False).encode();data=gzip.compress(raw,compresslevel=6,mtime=0)
            name=hashlib.sha256(data).hexdigest()+'.json.gz';target=folder/name
            if not target.exists():target.write_bytes(data)
            files.append({'relative_path':target.relative_to(shop).as_posix(),'sha256':hashlib.sha256(data).hexdigest(),'size':len(data)})
            record['same_sex'][sex]={'revision':revision,'motion':name}
    write_json(path,catalog)
    write_json(shop/'same-sex-assets.json',{'revision':revision,'items':ids,'files':files})
    print(json.dumps({'revision':revision,'items':len(ids),'files':len(files),'bytes':sum(x['size'] for x in files)}))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--game-root',type=Path,required=True);parser.add_argument('--shop-root',type=Path,required=True);args=parser.parse_args();build(args.game_root,args.shop_root)
