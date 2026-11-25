'use strict';
const {getWeather,isDate}=require('../server/weather-provider.cjs');
const {getAlerts}=require('../server/weather-alerts.cjs');
function httpStatus(result){
  if(result.status==='invalid')return 400;
  if(result.status!=='error')return 200;
  if(result.reason==='rate_limited')return 429;
  if(result.reason==='timeout')return 504;
  if(['missing_service_key','server_busy'].includes(result.reason))return 503;
  return 502;
}
async function serveWeather(req,res,{forecast=getWeather,alerts=getAlerts}={}){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({status:'invalid',reason:'method_not_allowed',summary:null});}
  const q=req.query||{};
  const type=q.type??'weather';
  if(!['weather','alerts'].includes(type)||['region','date','lat','lng','district'].some(k=>q[k]!=null&&typeof q[k]!=='string')
      ||(type==='weather'&&!isDate(q.date))||(q.date!=null&&!isDate(q.date)))
    return res.status(400).json({status:'invalid',reason:'invalid_query',summary:null});
  const input={region:q.region,date:q.date,lat:q.lat,lng:q.lng,district:q.district};
  const result=await (type==='alerts'?alerts(input):forecast(input));
  return res.status(httpStatus(result)).json(result);
}
module.exports=serveWeather;
module.exports.serveWeather=serveWeather;
module.exports.httpStatus=httpStatus;
