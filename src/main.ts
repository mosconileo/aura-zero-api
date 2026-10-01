import 'dotenv/config'
import './instrument.js'
import 'reflect-metadata'
import { createApp } from './app.factory.js'
import { loadEnv } from './config.js'

const env = loadEnv()
const app = await createApp(env)
await app.listen(env.PORT)
