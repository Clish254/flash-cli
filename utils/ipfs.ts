import { CAREncoderStream, createDirectoryEncoderStream } from 'ipfs-car'
import type { FileEntry, GlobalConfig } from '../types'
import { CID, Link } from 'multiformats'
import { tmpdir } from 'node:os'
import { readFile, open } from 'node:fs/promises'
import { Writable } from 'node:stream'
import { createWriteStream } from 'node:fs'
import { CarWriter } from '@ipld/car/writer'
import { create } from '@web3-storage/w3up-client'
import kleur from 'kleur'
import type { Email } from '../types'
import type { Config } from '../types'
import { getGlobalFlashConfig, updateFlashGlobalConfig } from './flashglobal'
import prompts from 'prompts'

// import { createNewKeypair, getUCANToken, loadKeyPair } from '../utils/ucan.js'
// import { create } from '@web3-storage/w3up-client'
// import prompts from 'prompts'
// import { writeFile } from 'node:fs/promises'

// const uploadToNftStorage = async (car: Blob, ucanToken: string, did: DID) => {
//   const res = await fetch('https://api.nft.storage/upload', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/car',
//       'Authorization': `Bearer ${ucanToken}`,
//       'x-agent-did': did,
//     },
//     body: car,
//   })
//   const text = await res.text()
//   console.log(res.status, text)
// }

// export const uploadToWeb3Storage = async (car: Blob, configEmail?: Email) => {
//   const client = await create()
//   if (!configEmail) {
//     const { email }: { email: Email } = await prompts([
//       {
//         message: 'Enter your email to verify you are not a bot',
//         type: 'text',
//         name: 'email',
//       },
//     ])
//     console.log(`An email to ${email} was sent`)
//     const config = JSON.parse(await readTextFile('flash.json'))
//     await writeFile('flash.json', JSON.stringify({ ...config, email }, null, 2))
//     try {
//       await client.authorize(email)
//     } catch {
//       return console.error(kleur.red(`Failed to send an email to ${email}`))
//     }
//   } else {
//     try {
//       await client.registerSpace(configEmail, {
//         provider: 'did:web:web3.storage',
//       })
//     } catch (e) {
//       const space = await client.createSpace()
//       await client.setCurrentSpace(space.did())
//     }
//   }

//   const result = await client.uploadCAR(car)
//   console.log(result)
// }

const tmp = tmpdir()

export const packCAR = async (files: FileEntry[], folder: string) => {
  const output = `${tmp}/${folder}.car`
  const placeholderCID = CID.parse(
    'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
  )
  let rootCID: CID<unknown, number, number, 1>
  await createDirectoryEncoderStream(files)
    .pipeThrough(
      new TransformStream({
        transform(block, controller) {
          rootCID = block.cid as CID<unknown, number, number, 1>
          controller.enqueue(block)
        },
      })
    )
    .pipeThrough(new CAREncoderStream([placeholderCID]))
    .pipeTo(Writable.toWeb(createWriteStream(output)))

  const fd = await open(output, 'r+')
  await CarWriter.updateRootsInFile(fd, [rootCID!])
  await fd.close()

  const file = await readFile(output)
  const blob = new Blob([file], { type: 'application/vnd.ipld.car' })
  return blob
}

const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

const emailPrompt = async () =>
  await prompts([
    {
      name: 'email',
      type: 'text',
      message: "Verify your email to confirm that you're not a bot",
      validate: value => (!emailPattern.test(value) ? 'Invalid email' : true),
    },
  ])

export const uploadCAR = async (car: Blob, { service }: Config) => {
  const client = await create()
  let globalConfig = await getGlobalFlashConfig()
  if (!globalConfig) {
    const result = await emailPrompt()
    console.log(`Sent email to ${result.email} 📧`)
    await client.authorize(result.email)

    console.log(kleur.cyan('Email authorized, uploading...'))

    const space = await client.createSpace()

    const did = space.did()

    await client.setCurrentSpace(did)
    try {
      await client.registerSpace(result.email, {
        provider: `did:web:${service}`,
      })
    } catch (err) {
      console.error('registration failed: ', err)
    }

    globalConfig = {
      email: result.email,
      did: did,
    }
    await updateFlashGlobalConfig(globalConfig)
  } else {
    await client.setCurrentSpace(globalConfig.did)
  }

  const result = await client.uploadCAR(car)
  return result
}
