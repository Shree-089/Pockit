/* Lists the Nebius models your API key can use. Usage: npm run ai:models */
import { listModels } from '../src/lib/nebiusClient.js'

try {
  const models = await listModels()
  console.log(`${models.length} models available:\n`)
  for (const id of models) console.log(`  ${id}`)
  console.log('\nCopy one chat/instruct model id into NEBIUS_MODEL in server/.env')
} catch (error) {
  console.error('Could not list models:', error.message)
  process.exitCode = 1
}
