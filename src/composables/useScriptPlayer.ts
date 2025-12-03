import { ref } from 'vue'
import axios from 'axios'
import { getAssetUrl, getBackgroundUrl } from '@/utils/asset'

export interface ScriptState {
  background: string | null
  bgm: string | null
  characters: Record<
    string,
    { id: number; face: number; name: string; ascension: number; visible: boolean }
  >
  activeCharacter: { code: string; id: number; face: number; name: string } | null
  text: string
  speaker: string
  isFinished: boolean
}

interface ScriptCommand {
  type: 'command' | 'dialogue'
  raw: string
  // Parsed properties
  speaker?: string
  text?: string
  commandName?: string
  args?: string[]
}

export function useScriptPlayer() {
  const scriptLines = ref<string[]>([])
  const currentLineIndex = ref(0)

  const state = ref<ScriptState>({
    background: null,
    bgm: null,
    characters: {},
    activeCharacter: null,
    text: '',
    speaker: '',
    isFinished: false,
  })

  const isLoading = ref(false)
  const currentRegion = ref('JP')

  // TODO: Full Script Parser Implementation Needed
  // The current implementation is a very basic regex-based parser that only handles linear dialogue
  // and simple commands like [scene], [bgm], and [speaker].
  //
  // A robust parser is required to support the full FGO script syntax, including:
  // 1. Control Flow: [label], [jump], [if], [selectBranch] (branching logic)
  // 2. Variables: [%1] for player name interpolation, etc.
  // 3. User Input: [input name]
  // 4. Character Management: [charaSet], [charaFace], [charaFadein/out], [charaTalk]
  // 5. Visual Effects: [fadein], [wipe], [shake], [flash]
  // 6. Audio Control: [soundStopAll], [se], [voice]
  //
  // Reference Example: https://static.atlasacademy.io/CN/Script/01/0100000011.txt
  // This file contains examples of character definitions, branching, and input handling that
  // the current parser cannot handle.

  // Simple parser for color codes and formatting: [color]...[-] or [line n]
  const cleanText = (text: string) => {
    // Remove color tags like [51d4ff] and [-]
    let cleaned = text.replace(/\[[0-9a-fA-F]{6}\]/g, '').replace(/\[-\]/g, '')
    // Remove [line n]
    cleaned = cleaned.replace(/\[line \d+\]/g, '')
    // Replace [r] with newline or space
    cleaned = cleaned.replace(/\[r\]/g, '\n')
    return cleaned
  }

  const parseLine = (line: string): ScriptCommand => {
    line = line.trim()
    if (line.startsWith('＠')) {
      // Speaker line
      // Example: ＠[51d4ff]广播语音[-]
      const content = line.substring(1)
      return {
        type: 'command', // Temporarily treat as command-like processing or just metadata
        raw: line,
        speaker: cleanText(content),
        commandName: 'speaker',
      }
    } else if (line.startsWith('[')) {
      // Command or Text with formatting?
      // If it matches [k], it's a click wait
      if (line === '[k]') {
        return { type: 'command', commandName: 'waitClick', raw: line }
      }

      // Check if it is a standard command [cmd arg1 arg2]
      // But be careful of text starting with [color]
      // Heuristic: commands usually don't have hex codes unless it's color
      // Standard commands: [bgm ...], [scene ...], [fadein ...]
      // Text often starts with [hex]

      const commandRegex = /^\[([a-zA-Z0-9_]+)(?:\s+(.*))?\]$/
      const match = line.match(commandRegex)

      if (match) {
        // It looks like a command
        // But we need to distinguish between [51d4ff] (color) and [bgm]
        // Color codes are usually 6 hex digits.
        const cmdName = match[1] as string
        if (/^[0-9a-fA-F]{6}$/.test(cmdName)) {
          // It's likely a color code start of a text line
          return {
            type: 'dialogue',
            text: cleanText(line),
            raw: line,
          }
        }

        return {
          type: 'command',
          commandName: cmdName,
          args: match[2] ? match[2].split(/\s+/) : [],
          raw: line,
        }
      }

      // If regex doesn't match cleanly (maybe multiple brackets), treat as text
      return {
        type: 'dialogue',
        text: cleanText(line),
        raw: line,
      }
    } else {
      // Plain text
      return {
        type: 'dialogue',
        text: cleanText(line),
        raw: line,
      }
    }
  }

  const fetchScriptContent = async (url: string) => {
    try {
      const response = await axios.get(url)
      return response.data
    } catch (error) {
      console.error('Failed to fetch script content:', error)
      return ''
    }
  }

  const loadScript = async (
    questData: any,
    region: string = 'JP',
    phase: number = 1,
    scriptIdx: number = 0
  ) => {
    isLoading.value = true
    state.value.isFinished = false
    currentRegion.value = region

    // Find script URLs based on phase and scriptIdx
    let scriptUrl = ''

    if (questData.phaseScripts) {
      // Find the specific phase
      const phaseData = questData.phaseScripts.find((p: any) => p.phase === phase)

      if (phaseData && phaseData.scripts && phaseData.scripts.length > scriptIdx) {
        // Get the specific script by index
        const scriptData = phaseData.scripts[scriptIdx]
        if (typeof scriptData.script === 'string') {
          scriptUrl = scriptData.script
        }
      }
    }

    if (!scriptUrl) {
      console.error(
        `No script URL found for quest ${questData.id}, phase ${phase}, scriptIdx ${scriptIdx}`,
        questData
      )
      isLoading.value = false
      return
    }

    const content = await fetchScriptContent(scriptUrl)
    scriptLines.value = content.split('\n').filter((l: string) => l.trim() !== '')
    currentLineIndex.value = 0

    // Start processing until first stop
    await processNextBlock()
    isLoading.value = false
  }

  const processNextBlock = async () => {
    // Process lines until we hit a Wait Click [k] or End [end]
    // or we run out of lines

    let stop = false

    while (!stop && currentLineIndex.value < scriptLines.value.length) {
      const line = scriptLines.value[currentLineIndex.value] as string
      const cmd = parseLine(line)

      currentLineIndex.value++

      if (cmd.type === 'command') {
        switch (cmd.commandName) {
          case 'speaker':
            state.value.speaker = cmd.speaker || ''
            // Auto-switch active character based on speaker name
            // ONLY if the character is currently visible
            if (state.value.speaker) {
              const charaCode = Object.keys(state.value.characters).find((code) => {
                const char = state.value.characters[code]
                return char && char.name === state.value.speaker
              })
              if (charaCode) {
                const char = state.value.characters[charaCode]
                if (char && char.visible) {
                  state.value.activeCharacter = { ...char, code: charaCode }
                }
              }
            }
            break
          case 'waitClick': // [k]
            stop = true
            break
          case 'scene':
            // [scene id]
            // TODO: Handle transitions and visual effects for scene changes
            if (cmd.args && cmd.args.length > 0) {
              const bgId = cmd.args[0] as string
              state.value.background = getBackgroundUrl(bgId, currentRegion.value)
            }
            break
          case 'bgm':
            // [bgm name vol]
            // TODO: Implement actual AudioContext or HTMLAudioElement handling
            if (cmd.args && cmd.args.length > 0) {
              const bgmId = cmd.args[0] as string
              state.value.bgm = bgmId
            }
            break
          case 'charaSet':
            // [charaSet CODE ID ASCENSION NAME...]
            if (cmd.args && cmd.args.length >= 3) {
              const code = cmd.args[0]
              const idStr = cmd.args[1]
              const ascStr = cmd.args[2]
              if (code && idStr && ascStr) {
                const id = parseInt(idStr)
                const ascension = parseInt(ascStr)
                const name = cmd.args.slice(3).join(' ') // Handle spaces in name
                state.value.characters[code] = { id, ascension, name, face: 0, visible: false }
              }
            }
            break
          case 'charaFace':
            // [charaFace CODE FACE_ID]
            if (cmd.args && cmd.args.length >= 2) {
              const code = cmd.args[0]
              const faceStr = cmd.args[1]
              if (code && faceStr) {
                const face = parseInt(faceStr)
                const char = state.value.characters[code]
                if (char) {
                  char.face = face
                  // If this is the active character, update active state too
                  if (state.value.activeCharacter && state.value.activeCharacter.code === code) {
                    state.value.activeCharacter = { ...char, code }
                  }
                }
              }
            }
            break
          case 'charaFadein':
            // [charaFadein CODE DURATION ...]
            if (cmd.args && cmd.args.length >= 1) {
              const code = cmd.args[0]
              if (code) {
                const char = state.value.characters[code]
                if (char) {
                  char.visible = true
                  state.value.activeCharacter = { ...char, code }
                }
              }
            }
            break
          case 'charaFadeout':
            // [charaFadeout CODE ...]
            if (cmd.args && cmd.args.length >= 1) {
              const code = cmd.args[0]
              if (code) {
                const char = state.value.characters[code]
                if (char) {
                  char.visible = false
                }
                if (state.value.activeCharacter && state.value.activeCharacter.code === code) {
                  state.value.activeCharacter = null
                }
              }
            }
            break
          case 'end':
            state.value.isFinished = true
            stop = true
            break
          // TODO: Add cases for [charaSet], [charaFace], [charaFadein], [label], [input], [branch] etc.
          // For now, unknown commands are just ignored/skipped
        }
      } else if (cmd.type === 'dialogue') {
        // Append text (sometimes text is split across lines before [k])
        // If we already have text and we receive more text without a speaker change or click wait,
        // it usually means appending.
        // However, typically [k] clears text for next block.
        // So for the current block, we replace or append?
        // Standard visual novel: append to current page or replace?
        // In FGO script, usually one [k] block is one "screen" of text.
        // But multiple text lines might exist before [k].

        // If the text was empty (start of block), set it.
        // If not, append.
        state.value.text = state.value.text
          ? state.value.text + '\n' + (cmd.text || '')
          : cmd.text || ''
      }
    }

    if (currentLineIndex.value >= scriptLines.value.length) {
      state.value.isFinished = true
    }
  }

  const next = () => {
    if (state.value.isFinished) return

    // Clear text for next block?
    // Usually after [k], the text box clears for the next dialogue.
    state.value.text = ''
    // Keep speaker? Usually speaker persists unless changed, but typically it is set again if needed.
    // But let's keep it for now.

    // We need to pass region again. Ideally store it in closure or ref.
    // For now, let's just default to JP or we need to refactor to store region in state.
    // Refactor: store region
    processNextBlock()
  }

  return {
    state,
    loadScript,
    next,
    isLoading,
  }
}
