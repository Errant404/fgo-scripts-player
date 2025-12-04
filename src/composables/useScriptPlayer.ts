import { ref, onUnmounted } from 'vue'
import axios from 'axios'
import { getAssetUrl, getBackgroundUrl, getBgmUrl, getSeUrl } from '@/utils/asset'
import { resourceManager } from '@/utils/resourceManager'
import { getSvtScript, Region } from '@/api/atlas'

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
  choices: { id: number; text: string }[]
  playerName: string
  playerGender: 'm' | 'f'
}

interface ScriptCommand {
  type: 'command' | 'dialogue' | 'choice' | 'choiceEnd'
  raw: string
  // Parsed properties
  speaker?: string
  text?: string
  commandName?: string
  args?: string[]
  choiceId?: number
}

export function useScriptPlayer() {
  const scriptLines = ref<string[]>([])
  const currentLineIndex = ref(0)
  const jumpOnNextChoiceMarker = ref<number | null>(null)
  const choiceMap = ref<Record<number, number>>({})

  const state = ref<ScriptState>({
    background: null,
    bgm: null,
    characters: {},
    activeCharacter: null,
    text: '',
    speaker: '',
    isFinished: false,
    choices: [],
    playerName: '藤丸立香',
    playerGender: 'm',
  })

  const isLoading = ref(false)
  const currentRegion = ref('JP')

  // Audio State
  let bgmAudio: HTMLAudioElement | null = null
  const seAudios = new Map<string, HTMLAudioElement>()

  // Audio Helper Functions
  const fadeAudio = (audio: HTMLAudioElement, duration: number, targetVolume: number = 0) => {
    if (duration <= 0) {
      audio.volume = targetVolume
      if (targetVolume === 0) {
        audio.pause()
      }
      return
    }

    const startVolume = audio.volume
    const startTime = performance.now()

    const fade = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000
      if (elapsed >= duration) {
        audio.volume = targetVolume
        if (targetVolume === 0) {
          audio.pause()
        }
        return
      }

      const ratio = elapsed / duration
      audio.volume = startVolume + (targetVolume - startVolume) * ratio
      requestAnimationFrame(fade)
    }

    requestAnimationFrame(fade)
  }

  const playBgm = (id: string, volume: number = 1.0, fadeDuration: number = 0) => {
    const rawUrl = getBgmUrl(id, currentRegion.value)
    const url = resourceManager.getResolvedUrl(rawUrl)
    // Boost volume because script values (e.g. 0.1) are often too quiet for web playback
    const adjustedVolume = Math.min(volume * 5.0, 1.0)

    if (bgmAudio && !bgmAudio.paused && (bgmAudio.src === url || bgmAudio.src === rawUrl)) {
      // Same BGM, just update volume
      fadeAudio(bgmAudio, fadeDuration, adjustedVolume)
      return
    }

    if (bgmAudio) {
      // Stop previous BGM
      const oldAudio = bgmAudio
      fadeAudio(oldAudio, fadeDuration, 0)
    }

    bgmAudio = new Audio(url)
    bgmAudio.loop = true
    bgmAudio.volume = 0 // Start at 0 if fading in
    bgmAudio.play().catch(e => console.error("Failed to play BGM", e))

    if (fadeDuration > 0) {
      fadeAudio(bgmAudio, fadeDuration, adjustedVolume)
    } else {
      bgmAudio.volume = adjustedVolume
    }

    state.value.bgm = id
  }

  const stopBgm = (id?: string, fadeDuration: number = 0) => {
    if (bgmAudio) {
      // If id is provided, check if it matches
      if (id && !bgmAudio.src.includes(id)) {
        return
      }
      fadeAudio(bgmAudio, fadeDuration, 0)
      state.value.bgm = null
    }
  }

  const playSe = (id: string) => {
    const rawUrl = getSeUrl(id, currentRegion.value)
    const url = resourceManager.getResolvedUrl(rawUrl)
    const audio = new Audio(url)
    audio.volume = 1.0 // Default volume for SE

    audio.onended = () => {
      seAudios.delete(id)
    }

    audio.play().catch(e => console.error("Failed to play SE", e))
    seAudios.set(id, audio)
  }

  const stopSe = (id: string, fadeDuration: number = 0) => {
    const audio = seAudios.get(id)
    if (audio) {
      fadeAudio(audio, fadeDuration, 0)
      setTimeout(() => {
        seAudios.delete(id)
      }, fadeDuration * 1000 + 100)
    }
  }

  const stopAllSound = (fadeDuration: number = 0) => {
    stopBgm(undefined, fadeDuration)
    seAudios.forEach((audio, id) => {
      stopSe(id, fadeDuration)
    })
  }

  onUnmounted(() => {
    stopAllSound(0)
  })

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
  const processText = (text: string) => {
    // 1. Gender Ternary: [&Male:Female]
    // We must handle this first because it might contain other tags
    // Note: This regex handles simple cases. Nested brackets might fail.
    // The DB parser splits by : looking ahead for closing bracket.
    // Here we assume [&M:F] format.
    let processed = text.replace(/\[&([^:\]]+):([^\]]+)\]/g, (match, male, female) => {
      return state.value.playerGender === 'm' ? male : female
    })

    // 2. Color Tags: [hex] -> <span style="color: #hex">
    processed = processed.replace(/\[([0-9a-fA-F]{6})\]/g, '<span style="color: #$1">')

    // 3. Reset Tag: [-] -> </span>
    // This is a simplification. Ideally we should track stack.
    // But replacing all [-] with </span> usually works if tags are well-nested.
    processed = processed.replace(/\[-\]/g, '</span>')

    // 4. Line: [line n] -> <hr> style
    processed = processed.replace(/\[line (\d+)\]/g, (match, len) => {
      const width = parseInt(len) * 15
      return `<span style="display:inline-block; width: ${width}px; border-top: 1px solid currentColor; vertical-align: middle; margin: 0 5px;"></span>`
    })

    // 5. Font Size: [f size] -> <span style="font-size: ...">
    // DB maps: small -> 0.75em, medium -> 1em, large -> 1.5em, x-large -> 2em
    // Also handles numeric?
    processed = processed.replace(/\[f ([^\]]+)\]/g, (match, size) => {
      let cssSize = '1em'
      if (size === 'small') cssSize = '0.75em'
      else if (size === 'medium') cssSize = '1em'
      else if (size === 'large') cssSize = '1.5em'
      else if (size === 'x-large') cssSize = '2em'
      else if (!isNaN(parseFloat(size))) cssSize = `${size}em` // Assuming numeric is em? Or just pass it?

      return `<span style="font-size: ${cssSize}">`
    })

    // 6. Hidden Name: [servantName id:hidden:true] -> trueName
    processed = processed.replace(/\[servantName \d+:([^:\]]+):([^\]]+)\]/g, '$2')

    // 7. Image: [image name:ruby] -> ruby (fallback)
    // Ideally we render image, but we need asset host.
    // Let's try to render image if we can.
    // Format: [image name:ruby] or [i name:ruby]
    // We need to import AssetHost? It is in atlas.ts but not imported here.
    // For now, let's just render the ruby text to avoid broken images.
    processed = processed.replace(/\[(?:image|i) [^:]+:([^\]]+)\]/g, '$1')

    // Replace [r] with newline or space
    processed = processed.replace(/\[r\]/g, '<br>')

    // Replace Player Name
    processed = processed.replace(/\[%1\]/g, state.value.playerName)

    // Replace Ruby: [#Base:Ruby] -> <ruby>Base<rt>Ruby</rt></ruby>
    processed = processed.replace(/\[#([^:\]]+):([^\]]+)\]/g, '<ruby>$1<rt>$2</rt></ruby>')

    // Replace Emphasis: [#Text] -> <span class="emphasis">Text</span>
    processed = processed.replace(/\[#([^:\]]+)\]/g, '<span class="emphasis">$1</span>')

    return processed
  }

  const parseLine = (line: string): ScriptCommand => {
    line = line.trim()

    if (line.startsWith('＄')) {
      return { type: 'command', commandName: 'noop', raw: line }
    }

    if (line.startsWith('？')) {
      if (line === '？！') {
        return { type: 'choiceEnd', raw: line }
      }
      // Choice: ？1：Text
      const match = line.match(/^？(\d+)：(.*)$/)
      if (match && match[1] && match[2]) {
        return {
          type: 'choice',
          choiceId: parseInt(match[1]),
          text: processText(match[2]),
          raw: line
        }
      }
    }

    if (line.startsWith('＠')) {
      // Speaker line
      // Example: ＠[51d4ff]广播语音[-]
      const content = line.substring(1)
      return {
        type: 'command', // Temporarily treat as command-like processing or just metadata
        raw: line,
        speaker: processText(content),
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
            text: processText(line),
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
        text: processText(line),
        raw: line,
      }
    } else {
      // Plain text
      return {
        type: 'dialogue',
        text: processText(line),
        raw: line,
      }
    }
  }

  const preloadUpcomingAssets = (startIndex: number, region: string, limitBlocks: number = 3) => {
    let blocksFound = 0
    let index = startIndex
    let isPreloading = true
    let hasEncounteredChoice = false

    while (index < scriptLines.value.length) {
      const line = scriptLines.value[index]
      if (!line) {
        index++
        continue
      }
      const cmd = parseLine(line)

      if (cmd.type === 'choice') {
        hasEncounteredChoice = true
        // Reset for new branch so we scan into it
        blocksFound = 0
        isPreloading = true
      } else if (cmd.type === 'choiceEnd') {
        // End of choice block, stop scanning
        break
      }

      if (isPreloading) {
        if (cmd.type === 'command') {
          switch (cmd.commandName) {
            case 'bgm':
              if (cmd.args && cmd.args.length > 0) {
                const url = getBgmUrl(cmd.args[0]!, region)
                resourceManager.preloadAudio(url)
              }
              break
            case 'se':
              if (cmd.args && cmd.args.length > 0) {
                const url = getSeUrl(cmd.args[0]!, region)
                resourceManager.preloadAudio(url)
              }
              break
            case 'scene':
              if (cmd.args && cmd.args.length > 0) {
                const url = getBackgroundUrl(cmd.args[0]!, region)
                resourceManager.preloadImage(url)
              }
              break
            case 'charaSet':
              // [charaSet CODE ID ASCENSION NAME...]
              if (cmd.args && cmd.args.length >= 3) {
                const id = cmd.args[1]!
                const url = getAssetUrl(`CharaFigure/${id}/${id}_merged.png`, region)
                resourceManager.preloadImage(url)

                // Preload svtScript data
                getSvtScript(parseInt(id), region as Region)
              }
              break
            case 'waitClick':
              blocksFound++
              break
            case 'end':
              blocksFound = limitBlocks // Stop scanning
              break
          }
        } else if (cmd.type === 'choice') {
          // Handled above
        }

        if (blocksFound >= limitBlocks) {
          isPreloading = false
          // If we haven't seen a choice, we can stop now.
          // Because we are just in linear text and reached the limit.
          if (!hasEncounteredChoice) {
            break
          }
        }
      }

      index++
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

    // Set default player name based on region
    switch (region) {
      case 'NA':
        state.value.playerName = 'Fujimaru'
        break
      case 'KR':
        state.value.playerName = '후지마루'
        break
      case 'CN':
      case 'TW':
      case 'JP':
      default:
        state.value.playerName = '藤丸' // DB uses just '藤丸' for JP/CN/TW
        break
    }

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

    // Preload initial batch (next 3 blocks)
    preloadUpcomingAssets(0, region, 3)

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

      if (cmd.type === 'choice') {
        if (jumpOnNextChoiceMarker.value !== null) {
          // We are currently playing a selected choice branch and hit the next branch
          // Jump to end
          currentLineIndex.value = jumpOnNextChoiceMarker.value
          jumpOnNextChoiceMarker.value = null
          // Continue loop to process what's after ？！
          continue
        }

        // Start of a new choice block
        // Scan ahead to find all choices and the end of the block
        const choices: { id: number; text: string; startIndex: number }[] = []
        let blockEndIndex = -1

        // Add current choice
        if (cmd.choiceId !== undefined && cmd.text) {
          choices.push({
            id: cmd.choiceId,
            text: cmd.text,
            startIndex: currentLineIndex.value // Content starts at next line
          })
        }

        // Scan forward
        let tempIndex = currentLineIndex.value
        while (tempIndex < scriptLines.value.length) {
          const line = scriptLines.value[tempIndex]
          if (!line) {
            tempIndex++
            continue
          }
          const scanCmd = parseLine(line)

          if (scanCmd.type === 'choice') {
            if (scanCmd.choiceId !== undefined && scanCmd.text) {
              choices.push({
                id: scanCmd.choiceId,
                text: scanCmd.text,
                startIndex: tempIndex + 1
              })
            }
          } else if (scanCmd.type === 'choiceEnd') {
            blockEndIndex = tempIndex + 1 // Resume after ？！
            break
          }
          tempIndex++
        }

        if (blockEndIndex !== -1 && choices.length > 0) {
          state.value.choices = choices.map(c => ({ id: c.id, text: c.text }))

          // Store mapping
          choiceMap.value = choices.reduce((acc, c) => {
            acc[c.id] = c.startIndex
            return acc
          }, {} as Record<number, number>)

          // Set jump marker for when we finish a branch
          // Actually, we set the jump marker when the user SELECTS a choice.
          // But we need to know where to jump TO.
          // We can store the blockEndIndex in the choiceMap or a separate ref?
          // Let's store it in the choiceMap or just use a separate ref for "currentBlockEnd"
          // But wait, selectChoice needs to know it.
          // Let's store it in a special key in choiceMap or just a separate ref.
          // Hack: Store it as choice ID -1? No.
          // Let's add a property to the composable scope.
          jumpOnNextChoiceMarker.value = blockEndIndex // Wait, this is "where to jump IF we hit a choice marker"
          // But right now we are PAUSING.
          // We need to store "where the block ends" so selectChoice can use it.
          // Actually, we can just store it in jumpOnNextChoiceMarker NOW?
          // No, jumpOnNextChoiceMarker is used inside the loop to detect "I hit a choice, I should jump".
          // If we set it now, and then stop, it's fine.
          // But selectChoice needs to set it again?
          // No.
          // When we select a choice, we set currentLineIndex = startIndex.
          // And we want jumpOnNextChoiceMarker to be blockEndIndex.
          // So we can just leave it set here!
          // But wait, if we set it here, and then stop.
          // User clicks choice. selectChoice sets currentLineIndex.
          // processNextBlock runs.
          // It hits lines.
          // If it hits a choice line, it checks jumpOnNextChoiceMarker. It is set. It jumps.
          // This works!

          stop = true
        }
      } else if (cmd.type === 'choiceEnd') {
        // If we hit this naturally (e.g. last choice branch finished), clear marker
        if (jumpOnNextChoiceMarker.value !== null) {
          jumpOnNextChoiceMarker.value = null
        }
      } else if (cmd.type === 'command') {
        switch (cmd.commandName) {
          case 'noop':
            break
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
              const rawUrl = getBackgroundUrl(bgId, currentRegion.value)
              state.value.background = resourceManager.getResolvedUrl(rawUrl)
            }
            break
          case 'bgm':
            // [bgm name vol]
            if (cmd.args && cmd.args.length > 0) {
              const bgmId = cmd.args[0] as string
              const vol = cmd.args.length > 1 ? parseFloat(cmd.args[1] as string) : 1.0
              playBgm(bgmId, vol)
            }
            break
          case 'bgmStop':
            // [bgmStop name fade]
            if (cmd.args && cmd.args.length > 0) {
              const bgmId = cmd.args[0] as string
              const fade = cmd.args.length > 1 ? parseFloat(cmd.args[1] as string) : 0
              stopBgm(bgmId, fade)
            }
            break
          case 'se':
            // [se id]
            if (cmd.args && cmd.args.length > 0) {
              const seId = cmd.args[0] as string
              playSe(seId)
            }
            break
          case 'seStop':
            // [seStop id fade]
            if (cmd.args && cmd.args.length > 0) {
              const seId = cmd.args[0] as string
              const fade = cmd.args.length > 1 ? parseFloat(cmd.args[1] as string) : 0
              stopSe(seId, fade)
            }
            break
          case 'soundStopAll':
            stopAllSound(0)
            break
          case 'soundStopAllFade':
            // [soundStopAllFade fade]
            if (cmd.args && cmd.args.length > 0) {
              const fade = parseFloat(cmd.args[0] as string)
              stopAllSound(fade)
            } else {
              stopAllSound(0)
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

  const next = async () => {
    if (state.value.isFinished) return

    // Clear text for next block?
    // Usually after [k], the text box clears for the next dialogue.
    state.value.text = ''
    state.value.choices = []
    // Keep speaker? Usually speaker persists unless changed, but typically it is set again if needed.
    // But let's keep it for now.

    // We need to pass region again. Ideally store it in closure or ref.
    // For now, let's just default to JP or we need to refactor to store region in state.
    // Refactor: store region
    await processNextBlock()

    // Preload next batch
    preloadUpcomingAssets(currentLineIndex.value, currentRegion.value, 3)
  }

  const selectChoice = async (choiceId: number) => {
    const startIndex = choiceMap.value[choiceId]
    if (startIndex !== undefined) {
      currentLineIndex.value = startIndex
      state.value.choices = []
      state.value.text = '' // Clear text before showing response
      await processNextBlock()

      // Preload next batch
      preloadUpcomingAssets(currentLineIndex.value, currentRegion.value, 3)
    }
  }

  const stopAll = () => {
    if (bgmAudio) {
      bgmAudio.pause()
      bgmAudio = null
    }
    seAudios.forEach(audio => {
      audio.pause()
    })
    seAudios.clear()
  }

  return {
    state,
    loadScript,
    next,
    selectChoice,
    isLoading,
    stopAll,
  }
}
