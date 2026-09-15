import { env } from 'cloudflare:workers';
import { networkProbe, classifyNetworkError } from '../../../../src/server/network-diagnostics';
export async function GET() {
  const bindings = env as unknown as {AI_API_KEY?:string;AI_PROJECT_ID?:string};
  let requestConstruction: {valid:boolean;category:string|null} = {valid:true,category:null};
  try {
    // Construct only, never execute this request. Values stay inside the Worker.
    new Request('https://api.openai.com/v1/responses', {method:'POST',redirect:'error',
      headers:{Authorization:`Bearer ${bindings.AI_API_KEY?.trim() ?? ''}`,
        'Content-Type':'application/json',...(bindings.AI_PROJECT_ID?{'OpenAI-Project':bindings.AI_PROJECT_ID}:{})},body:'{}'});
  } catch (error) {requestConstruction={valid:false,category:classifyNetworkError(error)};}
  return Response.json({inferenceCalls:0,requestConstruction,probes:await networkProbe()},
    {headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
