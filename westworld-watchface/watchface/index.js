/*
 * WESTWORLD // HOST MONITOR — Zepp OS watch face (API 1.0, runs on 1.x–4.x)
 *
 * Normal mode: animated "smoke" ring, orbiting seconds marker, date, time,
 * weekday, current location (city from the phone's weather service, GPS
 * coordinates on tap), heart rate, steps, battery and outside temperature.
 * AOD mode: static light ring on black with time, date and weekday.
 */
import { METRICS, LAYOUT } from './metrics'

const NORMAL = hmUI.show_level.ONLY_NORMAL
const AOD = hmUI.show_level.ONLY_AOD

const GPS_TIMEOUT_MS = 120 * 1000
const STORE_KEY = 'ww_last_fix'

function range(n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(i)
  return out
}

function digits(prefix) {
  return range(10).map((i) => `${prefix}_${i}.png`)
}

function pad(n, len) {
  let s = String(Math.abs(Math.round(n)))
  while (s.length < len) s = '0' + s
  return s
}

// --------------------------------------------------------------- geolocation
// Latitude/longitude may come back as decimal degrees or as a DMS object
// depending on firmware; normalise both to e.g. 55°45'N.
function toDms(value, isLat) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'object') {
    const d = value.degrees !== undefined ? value.degrees : value.degree
    const m = value.minutes !== undefined ? value.minutes : value.minute
    const dir = value.direction || ''
    if (d === undefined) return null
    return `${pad(d, isLat ? 2 : 3)}°${pad(m || 0, 2)}'${dir}`
  }
  const v = Number(value)
  if (isNaN(v) || v === 0) return null
  const a = Math.abs(v)
  const d = Math.floor(a)
  const m = Math.floor((a - d) * 60)
  const dir = isLat ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W'
  return `${pad(d, isLat ? 2 : 3)}°${pad(m, 2)}'${dir}`
}

function loadFix() {
  try {
    if (typeof hmFS !== 'undefined' && hmFS.SysProGetChars) return hmFS.SysProGetChars(STORE_KEY) || ''
  } catch (e) {}
  return ''
}

function saveFix(text) {
  try {
    if (typeof hmFS !== 'undefined' && hmFS.SysProSetChars) hmFS.SysProSetChars(STORE_KEY, text)
  } catch (e) {}
}

WatchFace({
  build() {
    const info = hmSetting.getDeviceInfo()
    const W = info.width || 480
    const M = METRICS[W] || METRICS[480]
    const L = LAYOUT
    const S = W / 480
    const P = (v) => Math.round(v * S)
    const cx = Math.round(W / 2)

    this.timeSensor = hmSensor.createSensor(hmSensor.id.TIME)
    this.weather = hmSensor.createSensor(hmSensor.id.WEATHER)

    // ------------------------------------------------------------ normal
    hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: 0, src: 'bg.png', show_level: NORMAL })

    const ringXY = Math.round((W - M.ring_box) / 2)
    this.ring = hmUI.createWidget(hmUI.widget.IMG_ANIM, {
      x: ringXY,
      y: ringXY,
      anim_path: 'anim',
      anim_prefix: 'ring',
      anim_ext: 'png',
      anim_fps: 10,
      anim_size: M.ring_frames,
      repeat_count: 0,
      anim_repeat: true,
      anim_status: hmUI.anim_status.START,
      display_on_restart: true,
      show_level: NORMAL,
    })

    // seconds marker orbiting on the ring
    hmUI.createWidget(hmUI.widget.TIME_POINTER, {
      second_centerX: cx,
      second_centerY: cx,
      second_posX: Math.round(M.sec_w / 2),
      second_posY: M.sec_h,
      second_path: 'sec.png',
      show_level: NORMAL,
    })

    const tx = P(L.text_x)
    this.buildDate(tx, P(L.date_y), M, 'dt', NORMAL)

    hmUI.createWidget(hmUI.widget.IMG_TIME, {
      hour_zero: 1,
      hour_startX: tx - P(3),
      hour_startY: P(L.time_y),
      hour_array: digits('big'),
      hour_space: 0,
      hour_unit_sc: 'big_colon.png',
      hour_unit_tc: 'big_colon.png',
      hour_unit_en: 'big_colon.png',
      minute_zero: 1,
      minute_array: digits('big'),
      minute_space: 0,
      minute_follow: 1,
      show_level: NORMAL,
    })

    const week = range(7).map((i) => `wk_${i}.png`)
    hmUI.createWidget(hmUI.widget.IMG_WEEK, {
      x: tx,
      y: P(L.week_y),
      week_en: week,
      week_tc: week,
      week_sc: week,
      show_level: NORMAL,
    })

    // location (city from the weather service) + coordinates / forecast line
    this.cityText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: tx,
      y: P(L.city_y),
      w: P(270),
      h: P(36),
      text: 'UNDISCLOSED LOCATION',
      text_size: P(28),
      color: 0x8a8a8a,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS,
      show_level: NORMAL,
    })
    this.subText = hmUI.createWidget(hmUI.widget.TEXT, {
      x: tx,
      y: P(L.coord_y),
      w: P(260),
      h: P(24),
      text: "'SOLOMON' BUILD 0.06",
      text_size: P(17),
      color: 0x161616,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.CENTER_V,
      text_style: hmUI.text_style.ELLIPSIS,
      show_level: NORMAL,
    })
    // tap on the location block -> GPS fix
    const hit = hmUI.createWidget(hmUI.widget.IMG, {
      x: tx - P(10),
      y: P(L.city_y),
      w: P(270),
      h: P(L.coord_y + 26 - L.city_y),
      src: 'click.png',
      show_level: NORMAL,
    })
    hit.addEventListener(hmUI.event.CLICK_UP, () => this.startGps())

    // vitals row
    const vit = [
      { type: hmUI.data_type.HEART },
      { type: hmUI.data_type.STEP },
      { type: hmUI.data_type.BATTERY, unit: 'v_pct.png' },
      { type: hmUI.data_type.WEATHER_CURRENT, unit: 'v_deg.png', neg: 'v_minus.png' },
    ]
    const colW = P(62)
    vit.forEach((v, i) => {
      const x = P(L.vitals_x[i]) - Math.round(colW / 2)
      const opts = {
        x,
        y: P(L.vitals_y),
        w: colW,
        h: M.vit_h,
        font_array: digits('v'),
        h_space: 0,
        align_h: hmUI.align.CENTER_H,
        invalid_image: 'v_none.png',
        padding: false,
        type: v.type,
        show_level: NORMAL,
      }
      if (v.unit) {
        opts.unit_sc = v.unit
        opts.unit_tc = v.unit
        opts.unit_en = v.unit
      }
      if (v.neg) opts.negative_image = v.neg
      hmUI.createWidget(hmUI.widget.TEXT_IMG, opts)
      // tap opens the matching system app
      hmUI.createWidget(hmUI.widget.IMG_CLICK, {
        x,
        y: P(L.vitals_y - 6),
        w: colW,
        h: P(46),
        src: 'click.png',
        type: v.type,
        show_level: NORMAL,
      })
    })

    // ------------------------------------------------------------ AOD
    const aodXY = Math.round((W - M.ring_box) / 2)
    hmUI.createWidget(hmUI.widget.IMG, { x: aodXY, y: aodXY, src: 'aod_ring.png', show_level: AOD })
    this.buildDate(tx, P(L.date_y), M, 'adt', AOD)
    hmUI.createWidget(hmUI.widget.IMG_TIME, {
      hour_zero: 1,
      hour_startX: tx - P(3),
      hour_startY: P(L.time_y),
      hour_array: digits('aod'),
      hour_space: 0,
      hour_unit_sc: 'aod_colon.png',
      hour_unit_tc: 'aod_colon.png',
      hour_unit_en: 'aod_colon.png',
      minute_zero: 1,
      minute_array: digits('aod'),
      minute_space: 0,
      minute_follow: 1,
      show_level: AOD,
    })
    const aweek = range(7).map((i) => `awk_${i}.png`)
    hmUI.createWidget(hmUI.widget.IMG_WEEK, {
      x: tx,
      y: P(L.week_y),
      week_en: aweek,
      week_tc: aweek,
      week_sc: aweek,
      show_level: AOD,
    })

    // ------------------------------------------------------------ lifecycle
    this.lastFix = loadFix()
    this.refresh()
    hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
      resume_call: () => {
        this.refresh()
        this.setAnim(true)
      },
      pause_call: () => {
        this.setAnim(false)
        this.stopGps()
      },
    })
  },

  // DD.MM.YY — day and month update themselves, the year is set from JS
  buildDate(x, y, M, prefix, level) {
    const arr = digits(prefix)
    const dw = M.date_w
    const dot = M.date_dot_w
    hmUI.createWidget(hmUI.widget.IMG_DATE, {
      day_startX: x,
      day_startY: y,
      day_sc_array: arr,
      day_tc_array: arr,
      day_en_array: arr,
      day_zero: 1,
      day_space: 0,
      day_align: hmUI.align.LEFT,
      day_is_character: false,
      show_level: level,
    })
    hmUI.createWidget(hmUI.widget.IMG, { x: x + dw * 2, y, src: `${prefix}_dot.png`, show_level: level })
    hmUI.createWidget(hmUI.widget.IMG_DATE, {
      month_startX: x + dw * 2 + dot,
      month_startY: y,
      month_sc_array: arr,
      month_tc_array: arr,
      month_en_array: arr,
      month_zero: 1,
      month_space: 0,
      month_align: hmUI.align.LEFT,
      month_is_character: false,
      show_level: level,
    })
    hmUI.createWidget(hmUI.widget.IMG, { x: x + dw * 4 + dot, y, src: `${prefix}_dot.png`, show_level: level })
    const year = hmUI.createWidget(hmUI.widget.TEXT_IMG, {
      x: x + dw * 4 + dot * 2,
      y,
      w: dw * 2 + 2,
      h: M.date_h,
      font_array: arr,
      h_space: 0,
      align_h: hmUI.align.LEFT,
      text: '00',
      show_level: level,
    })
    if (!this.years) this.years = []
    this.years.push(year)
  },

  setAnim(on) {
    if (!this.ring) return
    try {
      this.ring.setProperty(hmUI.prop.ANIM_STATUS, on ? hmUI.anim_status.START : hmUI.anim_status.STOP)
    } catch (e) {}
  },

  refresh() {
    const yy = pad((this.timeSensor.year || 2026) % 100, 2)
    ;(this.years || []).forEach((w) => w.setProperty(hmUI.prop.TEXT, yy))

    let city = ''
    let forecast = ''
    try {
      const f = this.weather.getForecastWeather()
      city = (f && f.cityName) || ''
      const today = f && f.forecastData && f.forecastData.count > 0 ? f.forecastData.data[0] : null
      if (today) {
        const sign = (t) => (t > 0 ? '+' : '') + t
        forecast = `TODAY ${sign(today.high)}° / ${sign(today.low)}°`
      }
    } catch (e) {}
    this.cityText.setProperty(hmUI.prop.TEXT, city ? city.toUpperCase() : 'UNDISCLOSED LOCATION')

    if (!this.gps) {
      const sub = this.lastFix || forecast || "'SOLOMON' BUILD 0.06"
      this.subText.setProperty(hmUI.prop.TEXT, sub)
    }
  },

  // ---------------------------------------------------------------- GPS
  startGps() {
    if (this.gps) return
    let geo = null
    try {
      if (hmSensor.id.GEOLOCATION !== undefined) geo = hmSensor.createSensor(hmSensor.id.GEOLOCATION)
    } catch (e) {}
    if (!geo) {
      this.subText.setProperty(hmUI.prop.TEXT, 'GPS UNAVAILABLE')
      return
    }
    this.gps = geo
    this.subText.setProperty(hmUI.prop.TEXT, 'ACQUIRING SIGNAL...')
    const check = () => {
      try {
        if (geo.getStatus && geo.getStatus() !== 'A') return
        const lat = toDms(geo.getLatitude(), true)
        const lon = toDms(geo.getLongitude(), false)
        if (!lat || !lon) return
        this.lastFix = `${lat}  ${lon}`
        saveFix(this.lastFix)
        this.stopGps()
        this.subText.setProperty(hmUI.prop.TEXT, this.lastFix)
      } catch (e) {}
    }
    try {
      geo.start()
      if (geo.onChange) geo.onChange(check)
    } catch (e) {}
    this.gpsPoll = timer.createTimer(2000, 2000, check, {})
    this.gpsStop = timer.createTimer(GPS_TIMEOUT_MS, 0, () => {
      if (!this.gps) return
      this.stopGps()
      this.subText.setProperty(hmUI.prop.TEXT, this.lastFix || 'SIGNAL LOST')
    }, {})
  },

  stopGps() {
    if (this.gpsPoll) timer.stopTimer(this.gpsPoll)
    if (this.gpsStop) timer.stopTimer(this.gpsStop)
    this.gpsPoll = this.gpsStop = null
    if (this.gps) {
      try {
        if (this.gps.offChange) this.gps.offChange()
        this.gps.stop()
      } catch (e) {}
      this.gps = null
    }
  },

  onDestroy() {
    this.stopGps()
  },
})
