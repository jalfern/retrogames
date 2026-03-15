/**
 * Minimal Glk Adapter for ifvms.js
 * Bridges Z-machine I/O to a React terminal interface.
 * Adapted from zork1-web (MIT license).
 */

const evtype_None = 0
const evtype_LineInput = 3
const wintype_TextBuffer = 3

const filemode_Write = 0x01
const filemode_Read = 0x02
const filemode_ReadWrite = 0x03

const seekmode_Start = 0
const seekmode_Current = 1
const seekmode_End = 2

const gestalt_CharOutput = 2
const gestalt_CharOutput_ExactPrint = 2
const gestalt_LineInput = 3
const gestalt_Unicode = 15

class RefStruct {
  constructor() { this.fields = [0, 0, 0, 0] }
  push_field(v) { this.fields.push(v) }
  get_field(i) { return this.fields[i] || 0 }
  set_field(i, v) { this.fields[i] = v }
}

class RefBox {
  constructor() { this.value = 0 }
  get_value() { return this.value }
  set_value(v) { this.value = v }
}

export function createGlk(terminal, savePrefix) {
  let outputBuffer = ''
  const streams = []
  let currentStream = null

  const inputState = {
    buffer: null,
    maxLen: 0,
    pending: false,
    event: null,
  }

  function createStream(rock) {
    const str = { rock: rock || 0, write_count: 0, read_count: 0, data: [], pos: 0 }
    streams.push(str)
    return str
  }

  const mainWindow = { type: wintype_TextBuffer, rock: 201, input_request_type: null, line_input_buf: null }
  mainWindow.str = createStream(201)
  const mainStream = mainWindow.str
  currentStream = mainStream

  function flushOutput() {
    if (outputBuffer) {
      terminal.print(outputBuffer)
      outputBuffer = ''
    }
  }

  function writeToStream(str, text) {
    if (str === mainStream || str === currentStream) {
      outputBuffer += text
    } else if (str.data) {
      for (let i = 0; i < text.length; i++) str.data.push(text.charCodeAt(i))
    }
    if (str) str.write_count += text.length
  }

  function requestLine(win, buf, initlen) {
    flushOutput()
    inputState.buffer = buf
    inputState.maxLen = buf ? buf.length : 0
    inputState.pending = true
    if (win) {
      win.input_request_type = 'line'
      win.line_input_buf = buf
    }
    terminal.waitForInput((input) => {
      if (inputState.pending && inputState.buffer) {
        const len = Math.min(input.length, inputState.maxLen)
        for (let i = 0; i < len; i++) inputState.buffer[i] = input.charCodeAt(i)
        if (inputState.event) inputState.event.set_field(2, len)
        inputState.pending = false
      }
    })
  }

  const Glk = {
    RefStruct,
    RefBox,

    fatal_error(msg) {
      const detail = msg instanceof Error
        ? `${msg.message}\n\nStack:\n${msg.stack}`
        : String(msg)
      console.error('Glk fatal error:', msg)
      terminal.handleError(detail)
    },

    glk_exit() {
      flushOutput()
      terminal.print('\n*** Game session ended ***')
    },

    glk_gestalt(sel) {
      if (sel === gestalt_CharOutput) return gestalt_CharOutput_ExactPrint
      if (sel === gestalt_LineInput) return 1
      if (sel === gestalt_Unicode) return 1
      return 0
    },
    glk_gestalt_ext(sel) { return this.glk_gestalt(sel) },

    // Window management
    glk_window_open(split, method, size, wintype, rock) {
      const win = { type: wintype, rock, input_request_type: null, line_input_buf: null }
      win.str = createStream(rock)
      return win
    },
    glk_window_close(win, result) {
      if (result) { result.set_field(0, win.str.read_count); result.set_field(1, win.str.write_count) }
    },
    glk_window_get_stream(win) { return win ? win.str : mainStream },
    glk_window_clear(win) { if (win && win.type === wintype_TextBuffer) terminal.clear() },
    glk_set_window(win) { if (win) currentStream = win.str },
    glk_window_get_size(win, w, h) { if (w && w.set_value) w.set_value(80); if (h && h.set_value) h.set_value(24) },
    glk_window_move_cursor() {},
    glk_window_get_parent() { return mainWindow },
    glk_window_set_arrangement() {},
    glk_window_iterate() { return null },

    // Stream management
    glk_stream_set_current(str) { currentStream = str || mainStream },
    glk_stream_get_current() { return currentStream },
    glk_stream_open_file(fref, fmode, rock) {
      const str = createStream(rock)
      str.fref = fref
      str.fmode = fmode
      if (fmode === filemode_Read || fmode === filemode_ReadWrite) {
        const saved = localStorage.getItem(fref.filename)
        if (saved) { try { str.data = JSON.parse(saved) } catch (e) { str.data = [] } }
      }
      return str
    },
    glk_stream_open_file_uni(fref, fmode, rock) { return this.glk_stream_open_file(fref, fmode, rock) },
    glk_stream_open_memory(buf, buflen, fmode, rock) {
      const str = createStream(rock)
      str.buf = buf; str.buflen = buflen; str.fmode = fmode
      return str
    },
    glk_stream_open_memory_uni(buf, buflen, fmode, rock) { return this.glk_stream_open_memory(buf, buflen, fmode, rock) },
    glk_stream_close(str, result) {
      if (result) { result.set_field(0, str.read_count); result.set_field(1, str.write_count) }
      if (str.fref && (str.fmode === filemode_Write || str.fmode === filemode_ReadWrite)) {
        localStorage.setItem(str.fref.filename, JSON.stringify(str.data))
      }
    },
    glk_stream_iterate() { return null },
    glk_stream_set_position(str, pos, seekmode) {
      if (seekmode === seekmode_Start) str.pos = pos
      else if (seekmode === seekmode_Current) str.pos += pos
      else if (seekmode === seekmode_End) str.pos = (str.data ? str.data.length : 0) + pos
    },
    glk_stream_get_position(str) { return str.pos },

    // Output
    glk_put_char(ch) { outputBuffer += String.fromCharCode(ch) },
    glk_put_char_stream(str, ch) {
      if (str === mainStream || str === currentStream) outputBuffer += String.fromCharCode(ch)
      else if (str.buf && str.pos < str.buflen) str.buf[str.pos++] = ch
      else if (str.data) str.data.push(ch)
      str.write_count++
    },
    glk_put_string(text) { outputBuffer += text },
    glk_put_string_stream(str, text) { writeToStream(str, text) },
    glk_put_buffer(buf) { for (let i = 0; i < buf.length; i++) outputBuffer += String.fromCharCode(buf[i]) },
    glk_put_buffer_stream(str, buf) {
      if (str === mainStream || str === currentStream) {
        for (let i = 0; i < buf.length; i++) outputBuffer += String.fromCharCode(buf[i])
      } else if (str.data) {
        for (let i = 0; i < buf.length; i++) str.data.push(buf[i])
      } else if (str.buf) {
        for (let i = 0; i < buf.length && str.pos < str.buflen; i++) str.buf[str.pos++] = buf[i]
      }
      str.write_count += buf.length
    },

    // Unicode output
    glk_put_char_uni(ch) { outputBuffer += String.fromCodePoint(ch) },
    glk_put_char_stream_uni(str, ch) { this.glk_put_char_stream(str, ch) },
    glk_put_string_uni(text) { outputBuffer += text },
    glk_put_buffer_uni(buf) { for (let i = 0; i < buf.length; i++) outputBuffer += String.fromCodePoint(buf[i]) },

    // ifvms extension
    glk_put_jstring(text) { if (text) outputBuffer += text },
    glk_put_jstring_stream(str, text) { if (text) writeToStream(str, text) },

    // Input - read from stream
    glk_get_char_stream(str) {
      if (str.buf && str.pos < str.buflen) { str.read_count++; return str.buf[str.pos++] }
      if (str.data && str.pos < str.data.length) { str.read_count++; return str.data[str.pos++] }
      return -1
    },
    glk_get_char_stream_uni(str) { return this.glk_get_char_stream(str) },
    glk_get_buffer_stream(str, buf, len) {
      let count = 0
      const max = len || buf.length
      for (let i = 0; i < max; i++) {
        const ch = this.glk_get_char_stream(str)
        if (ch === -1) break
        buf[i] = ch; count++
      }
      return count
    },
    glk_get_buffer_stream_uni(str, buf, len) { return this.glk_get_buffer_stream(str, buf, len) },
    glk_get_line_stream(str, buf, len) {
      let count = 0
      const max = len || buf.length
      for (let i = 0; i < max - 1; i++) {
        const ch = this.glk_get_char_stream(str)
        if (ch === -1) break
        buf[i] = ch; count++
        if (ch === 10) break
      }
      return count
    },
    glk_get_line_stream_uni(str, buf, len) { return this.glk_get_line_stream(str, buf, len) },

    // Styles (no-op)
    glk_set_style() {},
    glk_set_style_stream() {},
    glk_stylehint_set() {},
    glk_stylehint_clear() {},
    garglk_set_reversevideo() {},
    garglk_set_reversevideo_stream() {},
    garglk_set_zcolors_stream() {},

    // Input requests
    glk_request_line_event(win, buf, initlen) { requestLine(win, buf, initlen) },
    glk_request_line_event_uni(win, buf, initlen) { requestLine(win, buf, initlen) },
    glk_request_char_event(win) {
      flushOutput()
      if (win) win.input_request_type = 'char'
    },
    glk_request_char_event_uni(win) { this.glk_request_char_event(win) },
    glk_cancel_line_event(win, event) {
      if (win) { win.input_request_type = null; win.line_input_buf = null }
      if (event) event.set_field(0, 0)
    },
    glk_cancel_char_event(win) { if (win) win.input_request_type = null },

    // Events
    glk_select(event) {
      inputState.event = event
      event.set_field(0, evtype_LineInput)
      event.set_field(1, mainWindow)
      event.set_field(2, 0)
      event.set_field(3, 0)
    },
    glk_select_poll(event) { event.set_field(0, evtype_None) },

    glk_tick() {},

    // File operations
    glk_fileref_create_by_prompt(usage, fmode, rock) {
      return { rock, usage, fmode, filename: `${savePrefix}-save` }
    },
    glk_fileref_create_by_name(usage, name, rock) {
      return { rock, usage, filename: `${savePrefix}-${name}` }
    },
    glk_fileref_destroy() {},
    glk_fileref_does_file_exist(fref) {
      return localStorage.getItem(fref.filename) !== null ? 1 : 0
    },

    update() { flushOutput() },
  }

  return Glk
}
