window.__ModuleLoader__.load({
  id: 'dsh-sidebar-kit',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
     * dsh-sidebar-kit — 左侧栏管家
     *
     * 一个插件管两件事，都只针对左侧栏，且都只做「加法」：
     *
     *  1) 折叠：在「全局面板」图标列表最前面插一行可点击的标题，
     *     点它把其余图标折起来 / 展开。折叠用纯 CSS + `<html data-sbk-fold>`，
     *     所以别的插件后注册进来的图标也会自动被折进去，不用逐个登记 id。
     *
     *  2) 固定持久化：官方侧栏把「哪些面板被取消固定」存在内存里
     *     （`createPanelPins()` 每次 apply 重建 snapshot store，无存储后端），
     *     刷新 / 重启就复原。本插件借用官方那一行注册项自己暴露的注入面
     *     （`sidebar` 槽位的 inject，里面有 `setPinned` 和活的 `hooks.entryPins`），
     *     把上次保存的清单回放进去，之后每次变化写回 localStorage。
     *
     * 安全底线：这是整理层，不是功能层。任何异常都吞掉，最坏结果只是
     * 「没折叠」或「没持久化」＝回到官方原生行为，绝不会让侧栏渲染失败。
     * 卸载即完全复原。
     */

    const NS = 'sidebarKit'
    const ROW_ID = 'dsh-sidebar-kit'
    const PAGE_ID = 'dsh-sidebar-kit'

    /* 新键；同时兼容旧两个插件的键，安装时自动迁移 */
    const FOLD_KEY = 'dsh-sidebar-kit:folded'
    const PINS_KEY = 'dsh-sidebar-kit:unpinned'
    const LEGACY_FOLD_KEY = 'dsh-sidebar-fold:collapsed'
    const LEGACY_PINS_KEY = 'dsh-pin-persist:unpinned'

    /* ───────────────────────── 通用存储 ───────────────────────── */

    function readRaw(key) {
      try {
        return window.localStorage.getItem(key)
      } catch (e) {
        return null
      }
    }

    function writeRaw(key, value) {
      try {
        window.localStorage.setItem(key, value)
        return true
      } catch (e) {
        /* 隐私模式 / 配额满：不打断操作 */
        return false
      }
    }

    /* ───────────────────────── 折叠状态 ───────────────────────── */

    let folded = false

    function readFolded() {
      const own = readRaw(FOLD_KEY)
      if (own === '1') return true
      if (own === '0') return false
      /* 首次运行：继承旧折叠插件的选择，并立刻落到自己的键上 ——
         旧插件被卸载后，这份选择才不会跟着失效。 */
      const inherited = readRaw(LEGACY_FOLD_KEY) === '1'
      writeRaw(FOLD_KEY, inherited ? '1' : '0')
      return inherited
    }

    function applyFoldAttr(value) {
      try {
        if (value) document.documentElement.setAttribute('data-sbk-fold', '1')
        else document.documentElement.removeAttribute('data-sbk-fold')
      } catch (e) {
        /* ignore */
      }
    }

    function setFolded(next) {
      const value = !!next
      if (value === folded) return
      folded = value
      writeRaw(FOLD_KEY, value ? '1' : '0')
      applyFoldAttr(value)
      publish()
    }

    /* ───────────────────────── 固定状态 ───────────────────────── */

    /** 已保存的「取消固定」id；读失败就当没记录。 */
    function readPins() {
      const parse = raw => {
        if (typeof raw !== 'string' || raw === '') return null
        try {
          const parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return null
          return parsed.filter(id => typeof id === 'string' && id !== '')
        } catch (e) {
          return null
        }
      }
      const own = parse(readRaw(PINS_KEY))
      if (own !== null) return own
      /* 首次运行：继承旧持久化插件的记录，并立刻落到自己的键上 ——
         旧插件被卸载后，这份记录才不会跟着失效。 */
      const legacy = parse(readRaw(LEGACY_PINS_KEY))
      const inherited = legacy !== null ? legacy : []
      writePins(inherited)
      return inherited
    }

    function writePins(ids) {
      return writeRaw(PINS_KEY, JSON.stringify(ids))
    }

    let savedPins = []
    /** 已经接管到官方 pin 面了吗（设置页据此显示实时状态）。 */
    let attached = false
    /** 官方 store 此刻的真实快照。 */
    let livePins = []

    const listeners = new Set()
    /** 一个稳定引用：每次新建对象会让 useSyncExternalStore 无限重渲染。 */
    let view = { folded: false, saved: [], live: [], attached: false }

    function notify() {
      for (const fn of listeners) {
        try {
          fn()
        } catch (e) {
          /* 一个订阅者出错不影响其它人 */
        }
      }
    }

    function sameList(a, b) {
      return a.length === b.length && a.every((id, i) => id === b[i])
    }

    /** 任一字段变了才换引用并通知；否则保持同一个对象，渲染不动。 */
    function publish() {
      if (view.folded === folded
        && view.attached === attached
        && sameList(view.saved, savedPins)
        && sameList(view.live, livePins)) return
      view = { folded, saved: savedPins.slice(), live: livePins.slice(), attached }
      notify()
    }

    function setAttached(next) {
      if (attached === next) return
      attached = next
      publish()
    }

    function setLive(ids) {
      const next = Array.isArray(ids) ? ids.slice() : []
      if (sameList(next, livePins)) return
      livePins = next
      publish()
    }

    function setSaved(ids) {
      const next = Array.isArray(ids) ? ids.slice() : []
      if (sameList(next, savedPins)) return
      savedPins = next
      writePins(next)
      publish()
    }

    function subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }

    function useView() {
      return React.useSyncExternalStore(subscribe, () => view, () => view)
    }

    /* ──────────────────── 借用官方 pin 面 ──────────────────── */

    /**
     * 找到侧栏那一行注册项，取出它自己暴露的注入面。
     *
     * 官方 `ui-sidebar` 把 `setPinned` 与 `hooks.entryPins`（活快照）放在
     * `sidebar` 槽位注册项的 `inject` 里。`inject()` 是那个注册项自己的闭包，
     * 捕获的是侧栏自己的 ctx，所以调用它安全 —— 拿到的是同一个 `panelPins`
     * 单例，和用户点「取消固定」操作的是同一份状态。
     *
     * @param ctx 客户端根上下文。
     * @returns 借用到的接口；侧栏还没挂载或没有注入面时返回 undefined。
     */
    function borrowPinFace(ctx) {
      try {
        const entries = ctx.slots.entriesOfSlot('sidebar')
        for (const entry of entries) {
          if (typeof entry.inject !== 'function') continue
          let face
          try {
            face = entry.inject()
          } catch (e) {
            continue
          }
          if (face === null || typeof face !== 'object') continue
          const hooks = face.hooks
          const pins = hooks === null || typeof hooks !== 'object' ? undefined : hooks.entryPins
          if (pins === null || typeof pins !== 'object') continue
          if (typeof pins.getSnapshot !== 'function' || typeof pins.subscribe !== 'function') continue
          if (typeof face.setPinned !== 'function') continue
          return { setPinned: face.setPinned, pins }
        }
      } catch (e) {
        /* ignore */
      }
      return undefined
    }

    /* ──────────────────── 同步：回放 + 记录 ──────────────────── */

    /**
     * 把保存的清单回放进官方 store，然后开始记录后续变化。
     *
     * 回放必须先于记录：否则挂载瞬间那个空的初始快照会立刻把保存的清单覆盖成 []。
     *
     * @param face 借用到的 pin 接口。
     * @returns 释放函数；失败时 undefined。
     */
    function attachPins(face) {
      try {
        for (const id of readPins()) {
          try {
            face.setPinned(id, false)
          } catch (e) {
            /* 单个 id 失败不影响其它人 */
          }
        }
        /* 以 store 的真实结果为准：有的 id 可能已经不对应任何面板了。 */
        setSaved(face.pins.getSnapshot())
        setLive(face.pins.getSnapshot())
        setAttached(true)

        const stop = face.pins.subscribe(() => {
          try {
            const current = face.pins.getSnapshot()
            setLive(current)
            setSaved(current)
          } catch (e) {
            /* ignore */
          }
        })
        return typeof stop === 'function' ? stop : () => {}
      } catch (e) {
        setAttached(false)
        return undefined
      }
    }

    /**
     * 侧栏不是一次挂上就永不变化：插件重载、槽位重建都会换掉那个注册项，
     * 换掉之后旧的快照订阅就指向一个没人用的 store。这里在 `slots/changed`
     * 上重新借用，确保换过之后记录还跟着新 store。
     *
     * @param ctx 客户端根上下文。
     * @returns 清理函数。
     */
    function keepAttached(ctx) {
      let stop
      let lastFace

      const sync = () => {
        try {
          const face = borrowPinFace(ctx)
          if (face === undefined) {
            setAttached(false)
            return
          }
          if (face.pins === lastFace) return
          if (typeof stop === 'function') {
            try {
              stop()
            } catch (e) {
              /* ignore */
            }
          }
          stop = undefined
          lastFace = face.pins
          stop = attachPins(face)
        } catch (e) {
          setAttached(false)
        }
      }

      sync()

      let offChanged
      try {
        if (typeof ctx.on === 'function') {
          offChanged = ctx.on('slots/changed', key => {
            if (key === 'sidebar' || key === 'sidebar.panellist') sync()
          })
        }
      } catch (e) {
        /* ignore */
      }

      /* 侧栏声明时我们可能还没 apply（插件加载顺序不定），补一次声明等待。 */
      let offInject
      try {
        if (ctx.slots && typeof ctx.slots.inject === 'function') {
          offInject = ctx.slots.inject('sidebar', () => {
            sync()
            return () => {}
          })
        }
      } catch (e) {
        /* ignore */
      }

      return () => {
        for (const off of [offChanged, offInject, stop]) {
          if (typeof off === 'function') {
            try {
              off()
            } catch (e) {
              /* ignore */
            }
          }
        }
        stop = undefined
        lastFace = undefined
        setAttached(false)
      }
    }

    /* ────────────────────────── 样式 ────────────────────────── */

    const CSS = `
/* 折叠：把「不含本插件标题行」的面板按钮整行收起。
   用 :has() 而不是按 id 打类，后注册的图标自动纳入。 */
html[data-sbk-fold="1"] nav:has([data-slot="sidebar.panellist"]) button:not(:has([data-sbk-header])) {
  display: none !important;
}

/* 标题行箭头：折叠时转 -90° */
.sbk-chevron { display: inline-flex; align-items: center; justify-content: center; flex: none;
  transition: transform .15s ease; }
html[data-sbk-fold="1"] .sbk-chevron { transform: rotate(-90deg); }
@media (prefers-reduced-motion: reduce) { .sbk-chevron { transition: none; } }

/* 设置页 */
.sbk-page { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px 32px;
  color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 1.6; }
.sbk-page h2 { margin: 0; font-size: 16px; font-weight: 600; }
.sbk-page p { margin: 0; color: var(--dsw-alias-label-secondary); }
.sbk-card { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1); }
.sbk-card-title { font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary); }
.sbk-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sbk-btn { padding: 5px 12px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md); background: transparent; font: inherit; font-size: 13px;
  line-height: 20px; color: var(--dsw-alias-label-primary); cursor: pointer; }
.sbk-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.sbk-btn:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color); outline-offset: 1px; }
.sbk-hint { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.sbk-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.sbk-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-base); font-size: 13px; }
.sbk-empty { padding: 16px; border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg); color: var(--dsw-alias-label-tertiary);
  font-size: 13px; text-align: center; }
`

    function ensureCss() {
      try {
        if (document.querySelector('style[data-plugin-css="dsh-sidebar-kit"]') !== null) return
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-sidebar-kit'
        tag.dataset.pluginCss = 'dsh-sidebar-kit'
        tag.textContent = CSS
        document.head.appendChild(tag)
      } catch (e) {
        /* ignore */
      }
    }

    /* ──────────────────────── 侧栏标题行 ──────────────────────── */

    function Chevron(props) {
      const size = props && typeof props.size === 'number' ? props.size : 16
      return h(
        'svg',
        {
          className: 'sbk-chevron',
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M4 6.25 8 10.25 12 6.25' }),
      )
    }

    /**
     * 侧栏里的标题行图标。
     *
     * 它是一条真正的 `sidebar.panellist` 条目，所以侧栏用原生行样式渲染它
     * （行高、悬停、收起成 56px 轨道时的行为全部和别的图标一致）。
     * 这里只画箭头；点击由 apply() 里的捕获阶段监听接管，
     * 这样点整行都能开合，而不只是箭头那 16px。
     */
    function FoldGlyph(props) {
      const state = useView()
      const t = props && typeof props.t === 'function' ? props.t : undefined
      const L = (key, fallback) => (t ? t(key) : fallback)
      const title = state.folded ? L('header.expand', '展开全局面板') : L('header.collapse', '收起全局面板')
      return h(
        'span',
        {
          'data-sbk-header': '1',
          title,
          'aria-label': title,
          style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
        },
        h(Chevron, { size: props && props.size }),
      )
    }

    /* ───────────────────────── 设置页 ───────────────────────── */

    /** 设置 → 「左侧栏」：折叠开关 + 被取消固定的面板清单。 */
    function KitPage(props) {
      const state = useView()
      const t = props && typeof props.t === 'function' ? props.t : undefined
      const L = (key, fallback) => (t ? t(key) : fallback)

      return h(
        'div',
        { className: 'sbk-page' },
        h('h2', null, L('page.title', '左侧栏')),

        h(
          'div',
          { className: 'sbk-card' },
          h('span', { className: 'sbk-card-title' }, L('page.foldTitle', '全局面板图标')),
          h(
            'div',
            { className: 'sbk-row' },
            h(
              'button',
              { type: 'button', className: 'sbk-btn', onClick: () => setFolded(!state.folded) },
              state.folded ? L('page.expand', '展开图标') : L('page.collapse', '收起图标'),
            ),
            h(
              'span',
              { className: 'sbk-hint' },
              state.folded ? L('page.stateFolded', '当前：已收起') : L('page.stateExpanded', '当前：已展开'),
            ),
          ),
          h('span', { className: 'sbk-hint' }, L('page.foldTip', '提示：点侧栏里「全局面板」那一行就能开合，选择会记住。')),
        ),

        h(
          'div',
          { className: 'sbk-card' },
          h('span', { className: 'sbk-card-title' }, L('page.pinTitle', '被取消固定的面板')),
          h(
            'span',
            { className: 'sbk-hint' },
            state.attached
              ? L('page.stateOn', '状态：已接管侧栏的固定状态，改动会立即记住，刷新 / 重启后仍然保持。')
              : L('page.stateOff', '状态：还没接管到侧栏（侧栏尚未加载，或本版本接口有变）。'),
          ),
          state.saved.length === 0
            ? h('div', { className: 'sbk-empty' }, L('page.empty', '当前没有被取消固定的面板。'))
            : h(
                'ul',
                { className: 'sbk-list' },
                state.saved.map(id => h('li', { key: id, className: 'sbk-item' }, id)),
              ),
          h(
            'div',
            { className: 'sbk-row' },
            h(
              'button',
              {
                type: 'button',
                className: 'sbk-btn',
                disabled: state.saved.length === 0,
                onClick: () => {
                  try {
                    /* 只清记录，不动当前界面：想复原就在「更多」菜单里点回来。 */
                    setSaved([])
                  } catch (e) {
                    /* ignore */
                  }
                },
              },
              L('page.clear', '清空记录'),
            ),
            h('span', { className: 'sbk-hint' }, L('page.clearHint', '清空后，下次刷新恢复全部固定。')),
          ),
        ),
      )
    }

    /* ─────────────────── 整行点击接管（折叠） ─────────────────── */

    /**
     * 在捕获阶段拦住标题行上的点击。
     *
     * 为什么不在组件里 stopPropagation：图标只占行里 16px，其余宽度归侧栏
     * 自己的按钮（点了会走 selectPanel）。捕获阶段在 document 上先收到事件，
     * 能拦下整行的点击，把它变成折叠开关。只拦祖先按钮里含 data-sbk-header
     * 的那些，别的行一律放行。
     */
    function bindRowToggle() {
      const onClick = event => {
        try {
          const target = event.target
          if (!target || typeof target.closest !== 'function') return
          const button = target.closest('button')
          if (!button) return
          if (button.querySelector('[data-sbk-header]') === null) return
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          setFolded(!folded)
        } catch (e) {
          /* 拦截失败就退回默认行为，不影响其它功能 */
        }
      }
      document.addEventListener('click', onClick, true)
      return () => {
        try {
          document.removeEventListener('click', onClick, true)
        } catch (e) {
          /* ignore */
        }
      }
    }

    /* ────────────────────────── 入口 ────────────────────────── */

    function apply(ctx) {
      ensureCss()

      folded = readFolded()
      savedPins = readPins()
      view = { folded, saved: savedPins.slice(), live: [], attached: false }
      applyFoldAttr(folded)
      publish()

      /* 语言包 */
      let stopLocale
      try {
        if (ctx.locale && typeof ctx.locale.register === 'function') {
          stopLocale = ctx.locale.register(NS, {
            zh: {
              'header.label': '全局面板',
              'header.collapse': '收起全局面板图标',
              'header.expand': '展开全局面板图标',
              'page.title': '左侧栏',
              'page.foldTitle': '全局面板图标',
              'page.collapse': '收起图标',
              'page.expand': '展开图标',
              'page.stateFolded': '当前：已收起',
              'page.stateExpanded': '当前：已展开',
              'page.foldTip': '提示：点侧栏里「全局面板」那一行就能开合，选择会记住。',
              'page.pinTitle': '被取消固定的面板',
              'page.stateOn': '状态：已接管侧栏的固定状态，改动会立即记住，刷新 / 重启后仍然保持。',
              'page.stateOff': '状态：还没接管到侧栏（侧栏尚未加载，或本版本接口有变）。',
              'page.empty': '当前没有被取消固定的面板。',
              'page.clear': '清空记录',
              'page.clearHint': '清空后，下次刷新恢复全部固定。',
            },
            en: {
              'header.label': 'Global panels',
              'header.collapse': 'Collapse the global panel icons',
              'header.expand': 'Expand the global panel icons',
              'page.title': 'Left sidebar',
              'page.foldTitle': 'Global panel icons',
              'page.collapse': 'Collapse icons',
              'page.expand': 'Expand icons',
              'page.stateFolded': 'Now: collapsed',
              'page.stateExpanded': 'Now: expanded',
              'page.foldTip': 'Tip: click the “Global panels” row in the sidebar to toggle, and the choice is remembered.',
              'page.pinTitle': 'Unpinned panels',
              'page.stateOn': 'Status: attached to the sidebar pins — changes are remembered right away and survive a refresh or restart.',
              'page.stateOff': 'Status: not attached yet (the sidebar has not loaded, or this version changed the interface).',
              'page.empty': 'No panel is unpinned right now.',
              'page.clear': 'Clear the record',
              'page.clearHint': 'After clearing, the next refresh pins everything again.',
            },
          })
        }
      } catch (e) {
        /* 语言包注册失败：退回中文硬编码 */
      }

      const label = (key, fallback) => () => {
        try {
          if (ctx.locale && typeof ctx.locale.bind === 'function') return ctx.locale.bind(NS)(key)
        } catch (e) {
          /* ignore */
        }
        return fallback
      }

      /* 标题行：order -100 排在所有图标之前 */
      ctx.slots.inject('sidebar.panellist', () => {
        return ctx.slots.register(
          { name: 'sidebar.panellist', id: ROW_ID, order: -100, label: label('header.label', '全局面板'), locale: NS },
          FoldGlyph,
        )
      })

      /* 对应的 main 面板：给标题行一个安全落点（万一点击没被拦住也不会报错） */
      ctx.slots.inject('main', () => {
        return ctx.slots.register({ name: 'main', key: ROW_ID, locale: NS }, KitPage)
      })

      /* 设置页 */
      ctx.slots.inject('settings.section', () => {
        return ctx.slots.register(
          { name: 'settings.section', id: PAGE_ID, order: 91, label: label('page.title', '左侧栏'), locale: NS },
          KitPage,
        )
      })

      /* 整行点击 → 折叠开关 */
      ctx.effect(() => bindRowToggle(), 'dsh-sidebar-kit: row toggle')

      /* 回放 + 记录固定状态，侧栏重建时自动重挂 */
      ctx.effect(() => keepAttached(ctx), 'dsh-sidebar-kit: pins')

      /* 卸载时把 <html> 状态、样式与订阅清干净 */
      ctx.effect(() => {
        return () => {
          listeners.clear()
          try {
            document.documentElement.removeAttribute('data-sbk-fold')
          } catch (e) {
            /* ignore */
          }
          try {
            const tag = document.querySelector('style[data-plugin-css="dsh-sidebar-kit"]')
            if (tag !== null) tag.remove()
          } catch (e) {
            /* ignore */
          }
          if (typeof stopLocale === 'function') {
            try {
              stopLocale()
            } catch (e) {
              /* ignore */
            }
          }
        }
      }, 'dsh-sidebar-kit: teardown')
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
