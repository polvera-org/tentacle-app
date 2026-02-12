import { invoke } from '@tauri-apps/api/core'

export const CONFIG_KEY_OPENAI_API_KEY = 'openai_api_key'
export const CONFIG_KEY_INPUT_DEVICE = 'input_device'

function normalizeApiKey(apiKey: string): string | null {
  const normalizedApiKey = apiKey.trim()
  return normalizedApiKey.length > 0 ? normalizedApiKey : null
}

function normalizeInputDevice(deviceId: string): string | null {
  const normalizedDeviceId = deviceId.trim()
  return normalizedDeviceId.length > 0 ? normalizedDeviceId : null
}

export async function getOpenAIApiKey(): Promise<string | null> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot access OpenAI API key on server side')
  }

  const apiKey = await invoke<string | null>('get_config', {
    key: CONFIG_KEY_OPENAI_API_KEY,
  })

  if (apiKey === null) {
    return null
  }

  return normalizeApiKey(apiKey)
}

export async function setOpenAIApiKey(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot set OpenAI API key on server side')
  }

  const normalizedApiKey = apiKey.trim()

  await invoke('set_config', {
    key: CONFIG_KEY_OPENAI_API_KEY,
    value: normalizedApiKey,
  })
}

export async function getInputDevice(): Promise<string | null> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot access input device on server side')
  }

  const inputDevice = await invoke<string | null>('get_config', {
    key: CONFIG_KEY_INPUT_DEVICE,
  })

  if (inputDevice === null) {
    return null
  }

  return normalizeInputDevice(inputDevice)
}

export async function setInputDevice(deviceId: string): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot set input device on server side')
  }

  await invoke('set_config', {
    key: CONFIG_KEY_INPUT_DEVICE,
    value: deviceId.trim(),
  })
}
