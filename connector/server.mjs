import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createAsk } from './ask.mjs'
import { askInput } from './contract.mjs'

const dir = process.env.RYTE_ANSWERS_DIR || join(homedir(), 'Library', 'Application Support', 'ryte-answers')
const ask = createAsk({ dir })

const reply = (text, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) })

const server = new McpServer({ name: 'ryte-answers', version: '0.0.0' })

server.registerTool(
  'ask',
  {
    description:
      'Ask the user a question they answer later in Ryte. Give a short session name so the answer can find its way back.',
    // Field rules come from the contract; its cross-field rules (unique ids, recommended) run inside ask.
    inputSchema: askInput.shape,
  },
  async (input) => {
    try {
      const { id, path } = await ask(input)
      return reply(
        `Asked. Question id ${id}, saved to ${path}. The user answers it later; ask them to say 'check my answers' and call answers with this id.`,
      )
    } catch (error) {
      return reply(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.registerTool(
  'answers',
  {
    description: 'Check whether the user has answered a question you asked. Pass the question id that ask returned.',
    inputSchema: { id: z.string().describe('the question id, for example q-20261114-k3f9ax') },
  },
  async ({ id }) => {
    // The id becomes part of a file path, so only the shape ask produces is allowed.
    if (!/^q-[a-z0-9-]+$/.test(id)) return reply(`"${id}" is not a question id. Ids look like q-20261114-k3f9ax.`, true)
    if (existsSync(join(dir, 'questions', `${id}.json`))) return reply(`No answer yet for ${id}.`)
    return reply(`No question with id ${id}.`)
  },
)

await server.connect(new StdioServerTransport())
console.error(`ryte-answers ready, storing in ${dir}`)
