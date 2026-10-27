import {describe,it,expect,vi} from "vitest";
import {validateDispatchRanking,dispatchRouteOrder} from "@/domain/dispatch";
import {EvolutionProvider} from "@/integrations/evolution-provider";
const candidates=[{id:"a",operationalScore:50,facts:[{id:"f-a",key:"creditAnalysis",value:"Análise registrada"}]},{id:"b",operationalScore:30,facts:[]}];
const valid={priorities:[{id:"a",priority:80,reason:"Análise registrada com necessidade informada.",evidenceIds:["f-a"]},{id:"b",priority:30,reason:"Prioridade operacional; sem análise de crédito verificada.",evidenceIds:[]}]};
describe("dispatch route contract",()=>{
 it("persists an exact, explainable order",()=>expect(dispatchRouteOrder(validateDispatchRanking(valid,candidates))).toEqual(["a","b"]));
 it.each([
 {priorities:[valid.priorities[0]]},
 {priorities:[valid.priorities[0],valid.priorities[0]]},
 {priorities:[{...valid.priorities[0],id:"foreign"},valid.priorities[1]]},
 {priorities:[{...valid.priorities[0],evidenceIds:["f-foreign"]},valid.priorities[1]]},
 {priorities:[{...valid.priorities[0],evidenceIds:[]},valid.priorities[1]]},
 {priorities:[{...valid.priorities[0],priority:101},valid.priorities[1]]},
 {priorities:[{...valid.priorities[0],reason:"https://foreign.invalid"},valid.priorities[1]]},
 ])("rejects incomplete, fabricated or cross-contact priority",value=>expect(()=>validateDispatchRanking(value,candidates)).toThrow());
});
describe("pairing without QR",()=>{
 it("requests the selected number and returns only the pairing code",async()=>{const fetcher=vi.fn().mockResolvedValueOnce(Response.json({instance:{instanceName:"test",state:"close"}})).mockResolvedValueOnce(Response.json({pairingCode:"ABCD1234",count:1,hash:{apikey:"private"}}));const value=await new EvolutionProvider("https://evo.example.invalid","test-key",fetcher).requestPairing("test","5511999999999");expect(fetcher.mock.calls[1][0]).toBe("https://evo.example.invalid/instance/connect/test?number=5511999999999");expect(value).toEqual({state:"CONNECTING",qrCode:null,pairingCode:"ABCD1234"});});
 it("rejects malformed provider codes",async()=>{const fetcher=vi.fn().mockResolvedValueOnce(Response.json({instance:{instanceName:"test",state:"close"}})).mockResolvedValueOnce(Response.json({pairingCode:"<script>"}));await expect(new EvolutionProvider("https://evo.example.invalid","key",fetcher).requestPairing("test","5511999999999")).rejects.toMatchObject({code:"INVALID_RESPONSE"});});
});
