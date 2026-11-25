'use strict';
const {createRichTour}=require('../server/rich-tour.cjs');
const {createAccessibilityProvider}=require('../server/accessibility-provider.cjs');
const {createAccessibilityEnrichment}=require('../server/accessibility-enrichment.cjs');
// Reuse the existing evidence pipeline for one selected place; never hydrate search pages.
const enrichment=createAccessibilityEnrichment({provider:createAccessibilityProvider({maxCallsPerDay:15,concurrency:2,timeoutMs:2500})});
const {nearbyPublicFacilities}=require('../server/rich-facilities.cjs');
const service=createRichTour({env:process.env,fetcher:globalThis.fetch,loadFacilities:nearbyPublicFacilities,enrich:async place=>{
 const result=await enrichment.enrichPlaces([place],{refresh:true,maxPlaces:1});
 return result.data[0];
}});
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 try{
  const q=req.query||{},action=q.action;
  if(!['areas','search','detail'].includes(action))return res.status(400).json({error:'invalid_action'});
  if(Object.values(q).some(v=>typeof v!=='string'&&typeof v!=='number'))return res.status(400).json({error:'invalid_query'});
  return res.status(200).json(await service[action](q));
 }catch(e){return res.status(Number.isInteger(e?.status)?e.status:502).json({error:typeof e?.code==='string'?e.code:'rich_tour_unavailable'});}
};
