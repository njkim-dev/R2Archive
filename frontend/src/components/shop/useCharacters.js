import { useCallback,useEffect,useState } from 'react'
import { getCharacters } from '../../api/shopCharacters'
export default function useCharacters(userId,version){
  const [state,setState]=useState({owner:null,items:[],ready:false,error:''}),[epoch,setEpoch]=useState(0)
  useEffect(()=>{
    setState(previous=>previous.owner===userId&&previous.version===version?{...previous,error:''}:{owner:userId,version,items:[],ready:false,error:''})
    if(!userId||!version)return
    const controller=new AbortController()
    getCharacters(version,controller.signal).then(data=>{if(!controller.signal.aborted)setState({owner:userId,version,items:data.characters,ready:true,error:''})}).catch(error=>{if(!controller.signal.aborted)setState(previous=>({...previous,owner:userId,version,ready:true,error:typeof error.response?.data?.detail==='string'?error.response.data.detail:'캐릭터를 불러오지 못했습니다.'}))})
    return()=>controller.abort()
  },[userId,version,epoch])
  const reload=useCallback(()=>setEpoch(x=>x+1),[])
  return {...(state.owner===userId&&userId?state:{items:[],ready:false,error:''}),reload}
}
