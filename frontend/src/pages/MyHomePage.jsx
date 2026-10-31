import { useEffect,useState } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import useStore from '../store/useStore'
import { getShopMeta } from '../api/shop'
import { deleteCharacter } from '../api/shopCharacters'
import useCharacters from '../components/shop/useCharacters'
import ShopCharacterCards from '../components/shop/ShopCharacterCards'
import ShopCharacterPicker from '../components/shop/ShopCharacterPicker'
import ShopCharacterThumbnails from '../components/shop/ShopCharacterThumbnails'
import '../styles/shop.css'
import '../styles/shopCharacters.css'

export default function MyHomePage(){
  const {user,authLoaded,openLogin,logout}=useStore(),navigate=useNavigate(),[meta,setMeta]=useState(null),[creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const characters=useCharacters(authLoaded?user?.id:null,meta?.revision)
  useEffect(()=>{let active=true;getShopMeta().then(data=>{if(active)setMeta(data)}).catch(()=>{if(active)setError('상점 정보를 불러오지 못했습니다.')});return()=>{active=false}},[])
  async function remove(entry){if(!confirm('해당 캐릭터의 모든 데이터가 삭제되며 복구가 불가능합니다. 정말 삭제하시겠습니까?'))return;setBusy(true);try{await deleteCharacter(entry.character.id);characters.reload()}catch{setError('캐릭터를 삭제하지 못했습니다.')}finally{setBusy(false)}}
  function choose(entry){setCreating(false);navigate('/myhome/characters/'+entry.character.id)}
  return <div className="shop-app"><header className="shop-header"><Link className="shop-brand" to="/">R2 ARCHIVE</Link><nav><a href="/music/">음악</a><Link to="/shop">상점</Link><span>마이홈</span></nav><button onClick={user?logout:openLogin}>{user?'로그아웃':'로그인'}</button></header><main className="shop-main shop-character-home"><h1>마이홈</h1><p className="shop-character-status" role={error||characters.error?'alert':'status'}>{error||characters.error||(!authLoaded?'':!user?'로그인 후 이용할 수 있습니다.':!characters.ready?'캐릭터를 불러오는 중입니다.':'')}</p>{user&&<ShopCharacterCards items={characters.items} busy={busy||!characters.ready} onChoose={choose} onAll={()=>navigate('/myhome/all')} onCreate={characters.ready?()=>setCreating(true):undefined} onDelete={remove}/>}</main>{creating&&user&&<ShopCharacterPicker create characters={characters} version={meta?.revision} onChoose={choose} onClose={()=>setCreating(false)}/>}<ShopCharacterThumbnails characters={characters} meta={meta}/></div>
}
