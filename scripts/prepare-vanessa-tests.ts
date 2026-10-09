import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConciergePrompt } from "../src/integrations/credit-concierge";
import { OutreachPrompt } from "../src/integrations/outreach-gateway";
import { buildAgentSimulationInput, vanessaTestScenarios } from "../src/domain/agent-simulation";
import { syntheticPlaybook } from "./fixtures/commercial";

async function main() {
  const destination = path.resolve("output/vanessa-tests");
  const playbook = { ...syntheticPlaybook, objective: "Conversar sobre crédito consignado com permissão do cliente, entender a necessidade e encaminhar à equipe sem prometer condições.", understanding: "Estratégia fictícia para testes da Vanessa; exige revisão e aprovação antes de qualquer uso operacional." };
  const cases = vanessaTestScenarios.map((scenario) => ({ ...scenario, input: buildAgentSimulationInput({ message: scenario.message, simulationStage: scenario.stage }, playbook, []) }));
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "prompt-vanessa.txt"), `Modelo: gpt-6-luna\nVersão: ${ConciergePrompt.version}\nPrompt comercial utilizado no código. Saída estruturada pelo contrato da aplicação.\n\n${ConciergePrompt.instructions}\n`, "utf8");
  await writeFile(path.join(destination, "prompt-relacionamento-legado.txt"), `Modelo: gpt-6-luna\nVersão: ${OutreachPrompt.version}\n\n${OutreachPrompt.instructions}\n`, "utf8");
  await writeFile(path.join(destination, "cenarios.json"), JSON.stringify({ model: "gpt-6-luna", promptVersion: ConciergePrompt.version, status: "PREPARED_NOT_MODEL_EVALUATED", realOpenAICalls: 0, realMessagesSent: 0, playbook, cases }, null, 2), "utf8");
  console.log(JSON.stringify({ result: "PREPARED", destination, scenarios: cases.length, model: "gpt-6-luna", realOpenAICalls: 0, realMessagesSent: 0 }));
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
