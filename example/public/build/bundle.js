
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function select_option(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked') || select.options[0];
        return selected_option && selected_option.__value;
    }
    // unfortunately this can't be a constant as that wouldn't be tree-shakeable
    // so we cache the result instead
    let crossorigin;
    function is_crossorigin() {
        if (crossorigin === undefined) {
            crossorigin = false;
            try {
                if (typeof window !== 'undefined' && window.parent) {
                    void window.parent.document;
                }
            }
            catch (error) {
                crossorigin = true;
            }
        }
        return crossorigin;
    }
    function add_resize_listener(node, fn) {
        const computed_style = getComputedStyle(node);
        const z_index = (parseInt(computed_style.zIndex) || 0) - 1;
        if (computed_style.position === 'static') {
            node.style.position = 'relative';
        }
        const iframe = element('iframe');
        iframe.setAttribute('style', `display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ` +
            `overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: ${z_index};`);
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        const crossorigin = is_crossorigin();
        let unsubscribe;
        if (crossorigin) {
            iframe.src = `data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>`;
            unsubscribe = listen(window, 'message', (event) => {
                if (event.source === iframe.contentWindow)
                    fn();
            });
        }
        else {
            iframe.src = 'about:blank';
            iframe.onload = () => {
                unsubscribe = listen(iframe.contentWindow, 'resize', fn);
            };
        }
        append(node, iframe);
        return () => {
            if (crossorigin) {
                unsubscribe();
            }
            else if (unsubscribe && iframe.contentWindow) {
                unsubscribe();
            }
            detach(iframe);
        };
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }
    class HtmlTag {
        constructor(anchor = null) {
            this.a = anchor;
            this.e = this.n = null;
        }
        m(html, target, anchor = null) {
            if (!this.e) {
                this.e = element(target.nodeName);
                this.t = target;
                this.h(html);
            }
            this.i(anchor);
        }
        h(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.childNodes);
        }
        i(anchor) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(this.t, this.n[i], anchor);
            }
        }
        p(html) {
            this.d();
            this.h(html);
            this.i(this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.29.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* Users/russell/Documents/svelte-crossword/src/Toolbar.svelte generated by Svelte v3.29.0 */
    const file = "Users/russell/Documents/svelte-crossword/src/Toolbar.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (12:33) 
    function create_if_block_1(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Reveal";
    			attr_dev(button, "class", "svelte-1d4ytnk");
    			add_location(button, file, 12, 6, 352);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler_1*/ ctx[3], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(12:33) ",
    		ctx
    	});

    	return block;
    }

    // (10:4) {#if action == 'clear'}
    function create_if_block(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Clear";
    			attr_dev(button, "class", "svelte-1d4ytnk");
    			add_location(button, file, 10, 6, 243);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(10:4) {#if action == 'clear'}",
    		ctx
    	});

    	return block;
    }

    // (9:2) {#each actions as action}
    function create_each_block(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*action*/ ctx[4] == "clear") return create_if_block;
    		if (/*action*/ ctx[4] == "reveal") return create_if_block_1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (if_block) {
    				if_block.d(detaching);
    			}

    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(9:2) {#each actions as action}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div;
    	let each_value = /*actions*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "toolbar svelte-1d4ytnk");
    			add_location(div, file, 7, 0, 159);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*dispatch, actions*/ 3) {
    				each_value = /*actions*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Toolbar", slots, []);
    	const dispatch = createEventDispatcher();
    	let { actions = ["clear", "reveal"] } = $$props;
    	const writable_props = ["actions"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Toolbar> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => dispatch("event", "clear");
    	const click_handler_1 = () => dispatch("event", "reveal");

    	$$self.$$set = $$props => {
    		if ("actions" in $$props) $$invalidate(0, actions = $$props.actions);
    	};

    	$$self.$capture_state = () => ({ createEventDispatcher, dispatch, actions });

    	$$self.$inject_state = $$props => {
    		if ("actions" in $$props) $$invalidate(0, actions = $$props.actions);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [actions, dispatch, click_handler, click_handler_1];
    }

    class Toolbar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { actions: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Toolbar",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get actions() {
    		throw new Error("<Toolbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set actions(value) {
    		throw new Error("<Toolbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var keyboardData = [{
    	"row": 0,
    	"value": "Q"
    }, {
    	"row": 0,
    	"value": "W"
    }, {
    	"row": 0,
    	"value": "E"
    }, {
    	"row": 0,
    	"value": "R"
    }, {
    	"row": 0,
    	"value": "T"
    }, {
    	"row": 0,
    	"value": "Y"
    }, {
    	"row": 0,
    	"value": "U"
    },  {
    	"row": 0,
    	"value": "I"
    },  {
    	"row": 0,
    	"value": "O"
    },  {
    	"row": 0,
    	"value": "P"
    }, {
    	"row": 1,
    	"value": "A"
    }, {
    	"row": 1,
    	"value": "S"
    }, {
    	"row": 1,
    	"value": "D"
    }, {
    	"row": 1,
    	"value": "F"
    }, {
    	"row": 1,
    	"value": "G"
    }, {
    	"row": 1,
    	"value": "H"
    }, {
    	"row": 1,
    	"value": "J"
    }, {
    	"row": 1,
    	"value": "K"
    }, {
    	"row": 1,
    	"value": "L"
    }, {
    	"row": 2,
    	"value": "123"
    }, {
    	"row": 2,
    	"value": "Z"
    }, {
    	"row": 2,
    	"value": "X"
    }, {
    	"row": 2,
    	"value": "C"
    }, {
    	"row": 2,
    	"value": "V"
    }, {
    	"row": 2,
    	"value": "B"
    }, {
    	"row": 2,
    	"value": "N"
    }, {
    	"row": 2,
    	"value": "M"
    }, {
    	"row": 2,
    	"value": "delete"
    }
     ];

    /* Users/russell/Documents/svelte-crossword/node_modules/svelte-keyboard/src/Keyboard.svelte generated by Svelte v3.29.0 */
    const file$1 = "Users/russell/Documents/svelte-crossword/node_modules/svelte-keyboard/src/Keyboard.svelte";

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[14] = list[i].value;
    	return child_ctx;
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	return child_ctx;
    }

    // (68:10) {:else}
    function create_else_block(ctx) {
    	let t_value = /*value*/ ctx[14] + "";
    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*rowData*/ 1 && t_value !== (t_value = /*value*/ ctx[14] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(68:10) {:else}",
    		ctx
    	});

    	return block;
    }

    // (66:10) {#if swaps[value]}
    function create_if_block$1(ctx) {
    	let html_tag;
    	let raw_value = /*swaps*/ ctx[3][/*value*/ ctx[14]] + "";
    	let html_anchor;

    	const block = {
    		c: function create() {
    			html_anchor = empty();
    			html_tag = new HtmlTag(html_anchor);
    		},
    		m: function mount(target, anchor) {
    			html_tag.m(raw_value, target, anchor);
    			insert_dev(target, html_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*rowData*/ 1 && raw_value !== (raw_value = /*swaps*/ ctx[3][/*value*/ ctx[14]] + "")) html_tag.p(raw_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(html_anchor);
    			if (detaching) html_tag.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(66:10) {#if swaps[value]}",
    		ctx
    	});

    	return block;
    }

    // (60:6) {#each keys as { value }}
    function create_each_block_1(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*swaps*/ ctx[3][/*value*/ ctx[14]]) return create_if_block$1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	function touchstart_handler(...args) {
    		return /*touchstart_handler*/ ctx[5](/*value*/ ctx[14], ...args);
    	}

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[6](/*value*/ ctx[14], ...args);
    	}

    	const block = {
    		c: function create() {
    			button = element("button");
    			if_block.c();

    			set_style(button, "width", /*value*/ ctx[14].length === 1
    			? /*percentWidth*/ ctx[1]
    			: "auto");

    			attr_dev(button, "class", "svelte-1bx8glz");
    			toggle_class(button, "single", /*value*/ ctx[14].length === 1);
    			add_location(button, file$1, 60, 8, 1540);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			if_block.m(button, null);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button, "touchstart", touchstart_handler, { passive: true }, false, false),
    					listen_dev(button, "click", click_handler, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(button, null);
    				}
    			}

    			if (dirty & /*rowData, percentWidth*/ 3) {
    				set_style(button, "width", /*value*/ ctx[14].length === 1
    				? /*percentWidth*/ ctx[1]
    				: "auto");
    			}

    			if (dirty & /*rowData*/ 1) {
    				toggle_class(button, "single", /*value*/ ctx[14].length === 1);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(60:6) {#each keys as { value }}",
    		ctx
    	});

    	return block;
    }

    // (58:2) {#each rowData as keys}
    function create_each_block$1(ctx) {
    	let div;
    	let t;
    	let each_value_1 = /*keys*/ ctx[11];
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			attr_dev(div, "class", "row svelte-1bx8glz");
    			add_location(div, file$1, 58, 4, 1482);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			append_dev(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*rowData, percentWidth, dispatch, swaps*/ 15) {
    				each_value_1 = /*keys*/ ctx[11];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, t);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(58:2) {#each rowData as keys}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div;
    	let each_value = /*rowData*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "keyboard");
    			add_location(div, file$1, 56, 0, 1429);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*rowData, percentWidth, dispatch, swaps*/ 15) {
    				each_value = /*rowData*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Keyboard", slots, []);
    	const dispatch = createEventDispatcher();
    	let { data = keyboardData } = $$props;
    	const unique = arr => [...new Set(arr)];
    	const rows = unique(data.map(d => d.row));
    	rows.sort((a, b) => a - b);

    	const swaps = {
    		delete: "<svg width=\"1em\" height=\"1em\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"feather feather-delete\"><path d=\"M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z\"></path><line x1=\"18\" y1=\"9\" x2=\"12\" y2=\"15\"></line><line x1=\"12\" y1=\"9\" x2=\"18\" y2=\"15\"></line></svg>"
    	};

    	function onKey() {
    		const value = this.innerText;
    		dispatch("keydown", value);
    	}

    	const writable_props = ["data"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Keyboard> was created with unknown prop '${key}'`);
    	});

    	const touchstart_handler = value => dispatch("keydown", value);
    	const click_handler = value => dispatch("keydown", value);

    	$$self.$$set = $$props => {
    		if ("data" in $$props) $$invalidate(4, data = $$props.data);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		keyboardData,
    		dispatch,
    		data,
    		unique,
    		rows,
    		swaps,
    		onKey,
    		rowData,
    		maxInRow,
    		percentWidth
    	});

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate(4, data = $$props.data);
    		if ("rowData" in $$props) $$invalidate(0, rowData = $$props.rowData);
    		if ("maxInRow" in $$props) $$invalidate(7, maxInRow = $$props.maxInRow);
    		if ("percentWidth" in $$props) $$invalidate(1, percentWidth = $$props.percentWidth);
    	};

    	let rowData;
    	let maxInRow;
    	let percentWidth;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*data*/ 16) {
    			 $$invalidate(0, rowData = rows.map(r => data.filter(k => k.row === r)));
    		}

    		if ($$self.$$.dirty & /*rowData*/ 1) {
    			 $$invalidate(7, maxInRow = Math.max(...rowData.map(r => r.length)));
    		}

    		if ($$self.$$.dirty & /*maxInRow*/ 128) {
    			 $$invalidate(1, percentWidth = `${1 / maxInRow * 100}%`);
    		}
    	};

    	return [
    		rowData,
    		percentWidth,
    		dispatch,
    		swaps,
    		data,
    		touchstart_handler,
    		click_handler
    	];
    }

    class Keyboard extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { data: 4 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Keyboard",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get data() {
    		throw new Error("<Keyboard>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<Keyboard>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var getSecondarilyFocusedCells = ({ cells, focusedDirection, focusedCell }) => {
      const dimension = focusedDirection == "across" ? "x" : "y";
      const otherDimension = focusedDirection == "across" ? "y" : "x";
      const start = focusedCell[dimension];

      const cellsWithDiff = cells
        .filter(
          (cell) =>
            // take out cells in other columns/rows
            cell[otherDimension] == focusedCell[otherDimension]
        )
        .map((cell) => ({
          ...cell,
          // how far is this cell from our focused cell?
          diff: start - cell[dimension],
        }));
        
    	cellsWithDiff.sort((a, b) => a.diff - b.diff);

      // highlight all cells in same row/column, without any breaks
      const diffs = cellsWithDiff.map((d) => d.diff);
      const indices = range(Math.min(...diffs), Math.max(...diffs)).map((i) =>
        diffs.includes(i) ? i : " "
      );
      const chunks = indices.join(",").split(", ,");
      const currentChunk = (
        chunks.find(
          (d) => d.startsWith("0,") || d.endsWith(",0") || d.includes(",0,")
        ) || ""
      )
        .split(",")
        .map((d) => +d);

      const secondarilyFocusedCellIndices = cellsWithDiff
        .filter((cell) => currentChunk.includes(cell.diff))
        .map((cell) => cell.index);
      return secondarilyFocusedCellIndices;
    };

    const range = (min, max) =>
      Array.from({ length: max - min + 1 }, (v, k) => k + min);

    var getCellAfterDiff = ({ diff, cells, direction, focusedCell }) => {
      const dimension = direction == "across" ? "x" : "y";
      const otherDimension = direction == "across" ? "y" : "x";
      const start = focusedCell[dimension];
      const absDiff = Math.abs(diff);
      const isDiffNegative = diff < 0;

      const cellsWithDiff = cells
        .filter(
          (cell) =>
            // take out cells in other columns/rows
            cell[otherDimension] == focusedCell[otherDimension] &&
            // take out cells in wrong direction
            (isDiffNegative ? cell[dimension] < start : cell[dimension] > start)
        )
        .map((cell) => ({
          ...cell,
          // how far is this cell from our focused cell?
          absDiff: Math.abs(start - cell[dimension]),
        }));

      cellsWithDiff.sort((a, b) => a.absDiff - b.absDiff);
      return cellsWithDiff[absDiff - 1];
    };

    /* Users/russell/Documents/svelte-crossword/src/Cell.svelte generated by Svelte v3.29.0 */

    const file$2 = "Users/russell/Documents/svelte-crossword/src/Cell.svelte";

    // (104:2) {#if value}
    function create_if_block$2(ctx) {
    	let text_1;
    	let t;
    	let text_1_transition;
    	let current;

    	const block = {
    		c: function create() {
    			text_1 = svg_element("text");
    			t = text(/*value*/ ctx[2]);
    			attr_dev(text_1, "class", "value svelte-1fqxzxj");
    			attr_dev(text_1, "x", "0.5");
    			attr_dev(text_1, "y", "0.9");
    			attr_dev(text_1, "dominant-baseline", "auto");
    			attr_dev(text_1, "text-anchor", "middle");
    			add_location(text_1, file$2, 104, 4, 2278);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, text_1, anchor);
    			append_dev(text_1, t);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (!current || dirty & /*value*/ 4) set_data_dev(t, /*value*/ ctx[2]);
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!text_1_transition) text_1_transition = create_bidirectional_transition(
    					text_1,
    					pop,
    					{
    						y: 5,
    						delay: /*changeDelay*/ ctx[5],
    						duration: /*isRevealing*/ ctx[6] ? 250 : 0
    					},
    					true
    				);

    				text_1_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!text_1_transition) text_1_transition = create_bidirectional_transition(
    				text_1,
    				pop,
    				{
    					y: 5,
    					delay: /*changeDelay*/ ctx[5],
    					duration: /*isRevealing*/ ctx[6] ? 250 : 0
    				},
    				false
    			);

    			text_1_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(text_1);
    			if (detaching && text_1_transition) text_1_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(104:2) {#if value}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let g;
    	let rect;
    	let text_1;
    	let t;
    	let g_class_value;
    	let g_transform_value;
    	let g_id_value;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*value*/ ctx[2] && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			rect = svg_element("rect");
    			if (if_block) if_block.c();
    			text_1 = svg_element("text");
    			t = text(/*number*/ ctx[3]);
    			attr_dev(rect, "width", "1");
    			attr_dev(rect, "height", "1");
    			attr_dev(rect, "class", "svelte-1fqxzxj");
    			add_location(rect, file$2, 102, 2, 2225);
    			attr_dev(text_1, "class", "number svelte-1fqxzxj");
    			attr_dev(text_1, "x", "0.1");
    			attr_dev(text_1, "y", "0.1");
    			attr_dev(text_1, "dominant-baseline", "hanging");
    			attr_dev(text_1, "text-anchor", "start");
    			add_location(text_1, file$2, 114, 2, 2514);
    			attr_dev(g, "class", g_class_value = "cell " + /*custom*/ ctx[4] + " svelte-1fqxzxj");
    			attr_dev(g, "transform", g_transform_value = `translate(${/*x*/ ctx[0]}, ${/*y*/ ctx[1]})`);
    			attr_dev(g, "id", g_id_value = "cell-" + /*x*/ ctx[0] + "-" + /*y*/ ctx[1]);
    			attr_dev(g, "tabindex", "0");
    			toggle_class(g, "is-focused", /*isFocused*/ ctx[7]);
    			toggle_class(g, "is-secondarily-focused", /*isSecondarilyFocused*/ ctx[8]);
    			add_location(g, file$2, 92, 0, 1957);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g, anchor);
    			append_dev(g, rect);
    			if (if_block) if_block.m(g, null);
    			append_dev(g, text_1);
    			append_dev(text_1, t);
    			/*g_binding*/ ctx[19](g);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(g, "click", /*onClick*/ ctx[11], false, false, false),
    					listen_dev(g, "keydown", /*onKeydown*/ ctx[10], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*value*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*value*/ 4) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(g, text_1);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*number*/ 8) set_data_dev(t, /*number*/ ctx[3]);

    			if (!current || dirty & /*custom*/ 16 && g_class_value !== (g_class_value = "cell " + /*custom*/ ctx[4] + " svelte-1fqxzxj")) {
    				attr_dev(g, "class", g_class_value);
    			}

    			if (!current || dirty & /*x, y*/ 3 && g_transform_value !== (g_transform_value = `translate(${/*x*/ ctx[0]}, ${/*y*/ ctx[1]})`)) {
    				attr_dev(g, "transform", g_transform_value);
    			}

    			if (!current || dirty & /*x, y*/ 3 && g_id_value !== (g_id_value = "cell-" + /*x*/ ctx[0] + "-" + /*y*/ ctx[1])) {
    				attr_dev(g, "id", g_id_value);
    			}

    			if (dirty & /*custom, isFocused*/ 144) {
    				toggle_class(g, "is-focused", /*isFocused*/ ctx[7]);
    			}

    			if (dirty & /*custom, isSecondarilyFocused*/ 272) {
    				toggle_class(g, "is-secondarily-focused", /*isSecondarilyFocused*/ ctx[8]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    			if (if_block) if_block.d();
    			/*g_binding*/ ctx[19](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function pop(node, { delay = 0, duration = 250 }) {
    	return {
    		delay,
    		duration,
    		css: t => [`transform: translate(0, ${1 - t}px)`].join(";"), //
    		
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Cell", slots, []);
    	let { x } = $$props;
    	let { y } = $$props;
    	let { value } = $$props;
    	let { number } = $$props;
    	let { index } = $$props;
    	let { custom } = $$props;
    	let { changeDelay = 0 } = $$props;
    	let { isRevealing = false } = $$props;
    	let { isFocused = false } = $$props;
    	let { isSecondarilyFocused = false } = $$props;

    	let { onFocusCell = () => {
    		
    	} } = $$props;

    	let { onCellUpdate = () => {
    		
    	} } = $$props;

    	let { onFocusClueDiff = () => {
    		
    	} } = $$props;

    	let { onMoveFocus = () => {
    		
    	} } = $$props;

    	let { onFlipDirection = () => {
    		
    	} } = $$props;

    	let { onHistoricalChange = () => {
    		
    	} } = $$props;

    	let element;

    	function onFocusSelf() {
    		if (!element) return;
    		if (isFocused) element.focus();
    	}

    	function onKeydown(e) {
    		if (e.ctrlKey && e.key.toLowerCase() == "z") {
    			onHistoricalChange(e.shiftKey ? 1 : -1);
    		}

    		if (e.ctrlKey) return;
    		if (e.altKey) return;

    		if (e.key === "Tab") {
    			onFocusClueDiff(e.shiftKey ? -1 : 1);
    			e.preventDefault();
    			e.stopPropagation();
    			return;
    		}

    		if (e.key == " ") {
    			onFlipDirection();
    			e.preventDefault();
    			e.stopPropagation();
    			return;
    		}

    		if (["Delete", "Backspace"].includes(e.key)) {
    			onCellUpdate(index, "", -1);
    			return;
    		}

    		const isKeyInAlphabet = (/^[a-zA-Z()]$/).test(e.key);

    		if (isKeyInAlphabet) {
    			onCellUpdate(index, e.key.toUpperCase());
    			return;
    		}

    		const diff = ({
    			ArrowLeft: ["across", -1],
    			ArrowRight: ["across", 1],
    			ArrowUp: ["down", -1],
    			ArrowDown: ["down", 1]
    		})[e.key];

    		if (diff) {
    			onMoveFocus(...diff);
    			e.preventDefault();
    			e.stopPropagation();
    			return;
    		}
    	}

    	function onClick() {
    		onFocusCell(index);
    	}

    	const writable_props = [
    		"x",
    		"y",
    		"value",
    		"number",
    		"index",
    		"custom",
    		"changeDelay",
    		"isRevealing",
    		"isFocused",
    		"isSecondarilyFocused",
    		"onFocusCell",
    		"onCellUpdate",
    		"onFocusClueDiff",
    		"onMoveFocus",
    		"onFlipDirection",
    		"onHistoricalChange"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Cell> was created with unknown prop '${key}'`);
    	});

    	function g_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			element = $$value;
    			$$invalidate(9, element);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("x" in $$props) $$invalidate(0, x = $$props.x);
    		if ("y" in $$props) $$invalidate(1, y = $$props.y);
    		if ("value" in $$props) $$invalidate(2, value = $$props.value);
    		if ("number" in $$props) $$invalidate(3, number = $$props.number);
    		if ("index" in $$props) $$invalidate(12, index = $$props.index);
    		if ("custom" in $$props) $$invalidate(4, custom = $$props.custom);
    		if ("changeDelay" in $$props) $$invalidate(5, changeDelay = $$props.changeDelay);
    		if ("isRevealing" in $$props) $$invalidate(6, isRevealing = $$props.isRevealing);
    		if ("isFocused" in $$props) $$invalidate(7, isFocused = $$props.isFocused);
    		if ("isSecondarilyFocused" in $$props) $$invalidate(8, isSecondarilyFocused = $$props.isSecondarilyFocused);
    		if ("onFocusCell" in $$props) $$invalidate(13, onFocusCell = $$props.onFocusCell);
    		if ("onCellUpdate" in $$props) $$invalidate(14, onCellUpdate = $$props.onCellUpdate);
    		if ("onFocusClueDiff" in $$props) $$invalidate(15, onFocusClueDiff = $$props.onFocusClueDiff);
    		if ("onMoveFocus" in $$props) $$invalidate(16, onMoveFocus = $$props.onMoveFocus);
    		if ("onFlipDirection" in $$props) $$invalidate(17, onFlipDirection = $$props.onFlipDirection);
    		if ("onHistoricalChange" in $$props) $$invalidate(18, onHistoricalChange = $$props.onHistoricalChange);
    	};

    	$$self.$capture_state = () => ({
    		x,
    		y,
    		value,
    		number,
    		index,
    		custom,
    		changeDelay,
    		isRevealing,
    		isFocused,
    		isSecondarilyFocused,
    		onFocusCell,
    		onCellUpdate,
    		onFocusClueDiff,
    		onMoveFocus,
    		onFlipDirection,
    		onHistoricalChange,
    		element,
    		onFocusSelf,
    		onKeydown,
    		onClick,
    		pop
    	});

    	$$self.$inject_state = $$props => {
    		if ("x" in $$props) $$invalidate(0, x = $$props.x);
    		if ("y" in $$props) $$invalidate(1, y = $$props.y);
    		if ("value" in $$props) $$invalidate(2, value = $$props.value);
    		if ("number" in $$props) $$invalidate(3, number = $$props.number);
    		if ("index" in $$props) $$invalidate(12, index = $$props.index);
    		if ("custom" in $$props) $$invalidate(4, custom = $$props.custom);
    		if ("changeDelay" in $$props) $$invalidate(5, changeDelay = $$props.changeDelay);
    		if ("isRevealing" in $$props) $$invalidate(6, isRevealing = $$props.isRevealing);
    		if ("isFocused" in $$props) $$invalidate(7, isFocused = $$props.isFocused);
    		if ("isSecondarilyFocused" in $$props) $$invalidate(8, isSecondarilyFocused = $$props.isSecondarilyFocused);
    		if ("onFocusCell" in $$props) $$invalidate(13, onFocusCell = $$props.onFocusCell);
    		if ("onCellUpdate" in $$props) $$invalidate(14, onCellUpdate = $$props.onCellUpdate);
    		if ("onFocusClueDiff" in $$props) $$invalidate(15, onFocusClueDiff = $$props.onFocusClueDiff);
    		if ("onMoveFocus" in $$props) $$invalidate(16, onMoveFocus = $$props.onMoveFocus);
    		if ("onFlipDirection" in $$props) $$invalidate(17, onFlipDirection = $$props.onFlipDirection);
    		if ("onHistoricalChange" in $$props) $$invalidate(18, onHistoricalChange = $$props.onHistoricalChange);
    		if ("element" in $$props) $$invalidate(9, element = $$props.element);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*isFocused*/ 128) {
    			 (onFocusSelf());
    		}
    	};

    	return [
    		x,
    		y,
    		value,
    		number,
    		custom,
    		changeDelay,
    		isRevealing,
    		isFocused,
    		isSecondarilyFocused,
    		element,
    		onKeydown,
    		onClick,
    		index,
    		onFocusCell,
    		onCellUpdate,
    		onFocusClueDiff,
    		onMoveFocus,
    		onFlipDirection,
    		onHistoricalChange,
    		g_binding
    	];
    }

    class Cell extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			x: 0,
    			y: 1,
    			value: 2,
    			number: 3,
    			index: 12,
    			custom: 4,
    			changeDelay: 5,
    			isRevealing: 6,
    			isFocused: 7,
    			isSecondarilyFocused: 8,
    			onFocusCell: 13,
    			onCellUpdate: 14,
    			onFocusClueDiff: 15,
    			onMoveFocus: 16,
    			onFlipDirection: 17,
    			onHistoricalChange: 18
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Cell",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*x*/ ctx[0] === undefined && !("x" in props)) {
    			console.warn("<Cell> was created without expected prop 'x'");
    		}

    		if (/*y*/ ctx[1] === undefined && !("y" in props)) {
    			console.warn("<Cell> was created without expected prop 'y'");
    		}

    		if (/*value*/ ctx[2] === undefined && !("value" in props)) {
    			console.warn("<Cell> was created without expected prop 'value'");
    		}

    		if (/*number*/ ctx[3] === undefined && !("number" in props)) {
    			console.warn("<Cell> was created without expected prop 'number'");
    		}

    		if (/*index*/ ctx[12] === undefined && !("index" in props)) {
    			console.warn("<Cell> was created without expected prop 'index'");
    		}

    		if (/*custom*/ ctx[4] === undefined && !("custom" in props)) {
    			console.warn("<Cell> was created without expected prop 'custom'");
    		}
    	}

    	get x() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set x(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get y() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get number() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set number(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get index() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set index(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get custom() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set custom(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get changeDelay() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set changeDelay(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isRevealing() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isRevealing(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFocused() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFocused(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isSecondarilyFocused() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isSecondarilyFocused(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onFocusCell() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onFocusCell(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onCellUpdate() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onCellUpdate(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onFocusClueDiff() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onFocusClueDiff(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onMoveFocus() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onMoveFocus(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onFlipDirection() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onFlipDirection(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onHistoricalChange() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onHistoricalChange(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/russell/Documents/svelte-crossword/src/Puzzle.svelte generated by Svelte v3.29.0 */
    const file$3 = "Users/russell/Documents/svelte-crossword/src/Puzzle.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[26] = list[i].x;
    	child_ctx[27] = list[i].y;
    	child_ctx[28] = list[i].value;
    	child_ctx[29] = list[i].index;
    	child_ctx[30] = list[i].number;
    	child_ctx[31] = list[i].custom;
    	return child_ctx;
    }

    // (146:4) {#each cells as { x, y, value, index, number, custom }}
    function create_each_block$2(ctx) {
    	let cell;
    	let current;

    	cell = new Cell({
    			props: {
    				x: /*x*/ ctx[26],
    				y: /*y*/ ctx[27],
    				index: /*index*/ ctx[29],
    				value: /*value*/ ctx[28],
    				number: /*number*/ ctx[30],
    				custom: /*custom*/ ctx[31],
    				changeDelay: /*isRevealing*/ ctx[2]
    				? /*revealDuration*/ ctx[5] / /*cells*/ ctx[0].length * /*index*/ ctx[29]
    				: 0,
    				isRevealing: /*isRevealing*/ ctx[2],
    				isFocused: /*focusedCellIndex*/ ctx[1] == /*index*/ ctx[29] && !/*isDisableHighlight*/ ctx[3],
    				isSecondarilyFocused: /*secondarilyFocusedCells*/ ctx[6].includes(/*index*/ ctx[29]) && !/*isDisableHighlight*/ ctx[3],
    				onFocusCell: /*onFocusCell*/ ctx[11],
    				onCellUpdate: /*onCellUpdate*/ ctx[9],
    				onFocusClueDiff: /*onFocusClueDiff*/ ctx[12],
    				onMoveFocus: /*onMoveFocus*/ ctx[13],
    				onFlipDirection: /*onFlipDirection*/ ctx[14],
    				onHistoricalChange: /*onHistoricalChange*/ ctx[10]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(cell.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(cell, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const cell_changes = {};
    			if (dirty[0] & /*cells*/ 1) cell_changes.x = /*x*/ ctx[26];
    			if (dirty[0] & /*cells*/ 1) cell_changes.y = /*y*/ ctx[27];
    			if (dirty[0] & /*cells*/ 1) cell_changes.index = /*index*/ ctx[29];
    			if (dirty[0] & /*cells*/ 1) cell_changes.value = /*value*/ ctx[28];
    			if (dirty[0] & /*cells*/ 1) cell_changes.number = /*number*/ ctx[30];
    			if (dirty[0] & /*cells*/ 1) cell_changes.custom = /*custom*/ ctx[31];

    			if (dirty[0] & /*isRevealing, revealDuration, cells*/ 37) cell_changes.changeDelay = /*isRevealing*/ ctx[2]
    			? /*revealDuration*/ ctx[5] / /*cells*/ ctx[0].length * /*index*/ ctx[29]
    			: 0;

    			if (dirty[0] & /*isRevealing*/ 4) cell_changes.isRevealing = /*isRevealing*/ ctx[2];
    			if (dirty[0] & /*focusedCellIndex, cells, isDisableHighlight*/ 11) cell_changes.isFocused = /*focusedCellIndex*/ ctx[1] == /*index*/ ctx[29] && !/*isDisableHighlight*/ ctx[3];
    			if (dirty[0] & /*secondarilyFocusedCells, cells, isDisableHighlight*/ 73) cell_changes.isSecondarilyFocused = /*secondarilyFocusedCells*/ ctx[6].includes(/*index*/ ctx[29]) && !/*isDisableHighlight*/ ctx[3];
    			cell.$set(cell_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(cell.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(cell.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(cell, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(146:4) {#each cells as { x, y, value, index, number, custom }}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let section;
    	let svg;
    	let svg_viewBox_value;
    	let t;
    	let div;
    	let keyboard;
    	let current;
    	let each_value = /*cells*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	keyboard = new Keyboard({ $$inline: true });
    	keyboard.$on("keydown", /*onKeydown*/ ctx[15]);

    	const block = {
    		c: function create() {
    			section = element("section");
    			svg = svg_element("svg");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			div = element("div");
    			create_component(keyboard.$$.fragment);
    			attr_dev(svg, "viewBox", svg_viewBox_value = "0 0 " + /*w*/ ctx[7] + " " + /*h*/ ctx[8]);
    			attr_dev(svg, "class", "svelte-96b0");
    			add_location(svg, file$3, 144, 2, 4358);
    			attr_dev(section, "class", "puzzle svelte-96b0");
    			toggle_class(section, "stacked", /*stacked*/ ctx[4]);
    			add_location(section, file$3, 143, 0, 4317);
    			attr_dev(div, "class", "keyboard svelte-96b0");
    			add_location(div, file$3, 167, 0, 5159);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, svg);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(svg, null);
    			}

    			insert_dev(target, t, anchor);
    			insert_dev(target, div, anchor);
    			mount_component(keyboard, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*cells, isRevealing, revealDuration, focusedCellIndex, isDisableHighlight, secondarilyFocusedCells, onFocusCell, onCellUpdate, onFocusClueDiff, onMoveFocus, onFlipDirection, onHistoricalChange*/ 32367) {
    				each_value = /*cells*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(svg, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if (!current || dirty[0] & /*w, h*/ 384 && svg_viewBox_value !== (svg_viewBox_value = "0 0 " + /*w*/ ctx[7] + " " + /*h*/ ctx[8])) {
    				attr_dev(svg, "viewBox", svg_viewBox_value);
    			}

    			if (dirty[0] & /*stacked*/ 16) {
    				toggle_class(section, "stacked", /*stacked*/ ctx[4]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(keyboard.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(keyboard.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(t);
    			if (detaching) detach_dev(div);
    			destroy_component(keyboard);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const numberOfStatesInHistory = 10;

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Puzzle", slots, []);
    	let { clues } = $$props;
    	let { cells } = $$props;
    	let { focusedDirection } = $$props;
    	let { focusedCellIndex } = $$props;
    	let { focusedCell } = $$props;
    	let { isRevealing } = $$props;
    	let { isDisableHighlight } = $$props;
    	let { stacked } = $$props;
    	let { revealDuration = 0 } = $$props;
    	let cellsHistoryIndex = 0;
    	let cellsHistory = [];
    	let focusedCellIndexHistoryIndex = 0;
    	let focusedCellIndexHistory = [];
    	let secondarilyFocusedCells = [];

    	function updateSecondarilyFocusedCells() {
    		$$invalidate(6, secondarilyFocusedCells = getSecondarilyFocusedCells({ cells, focusedDirection, focusedCell }));
    	}

    	function onCellUpdate(index, newValue, diff = 1) {
    		const doReplaceFilledCells = !!cells[index].value;

    		const newCells = [
    			...cells.slice(0, index),
    			{ ...cells[index], value: newValue },
    			...cells.slice(index + 1)
    		];

    		cellsHistory = [newCells, ...cellsHistory.slice(cellsHistoryIndex)].slice(0, numberOfStatesInHistory);
    		cellsHistoryIndex = 0;
    		$$invalidate(0, cells = newCells);
    		onFocusCellDiff(diff, doReplaceFilledCells);
    	}

    	function onHistoricalChange(diff) {
    		cellsHistoryIndex += -diff;
    		$$invalidate(0, cells = cellsHistory[cellsHistoryIndex] || cells);
    		focusedCellIndexHistoryIndex += -diff;
    		$$invalidate(1, focusedCellIndex = focusedCellIndexHistory[cellsHistoryIndex] || focusedCellIndex);
    	}

    	function onFocusCell(index) {
    		if (index == focusedCellIndex) {
    			onFlipDirection();
    		} else {
    			$$invalidate(1, focusedCellIndex = index);
    			focusedCellIndexHistory = [index, ...focusedCellIndexHistory.slice(0, numberOfStatesInHistory)];
    			focusedCellIndexHistoryIndex = 0;
    		}
    	}

    	function onFocusCellDiff(diff, doReplaceFilledCells = true) {
    		const sortedCellsInDirectionFiltered = sortedCellsInDirection.filter(d => doReplaceFilledCells ? true : !d.value);
    		const currentCellIndex = sortedCellsInDirectionFiltered.findIndex(d => d.index == focusedCellIndex);
    		const nextCellIndex = (sortedCellsInDirectionFiltered[currentCellIndex + diff] || {}).index;
    		const nextCell = cells[nextCellIndex];
    		if (!nextCell) return;
    		onFocusCell(nextCellIndex);
    	}

    	function onFocusClueDiff(diff = 1) {
    		const currentNumber = focusedCell.clueNumbers[focusedDirection];

    		let nextCluesInDirection = clues.filter(clue => (diff > 0
    		? clue.number > currentNumber
    		: clue.number < currentNumber) && clue.direction == focusedDirection);

    		if (diff < 0) {
    			nextCluesInDirection = nextCluesInDirection.reverse();
    		}

    		let nextClue = nextCluesInDirection[Math.abs(diff) - 1];

    		if (!nextClue) {
    			onFlipDirection();
    			nextClue = clues.filter(clue => clue.direction == focusedDirection)[0];
    		}

    		$$invalidate(1, focusedCellIndex = cells.findIndex(cell => cell.x == nextClue.x && cell.y == nextClue.y));
    	}

    	function onMoveFocus(direction, diff) {
    		if (focusedDirection != direction) {
    			$$invalidate(16, focusedDirection = direction);
    		} else {
    			const nextCell = getCellAfterDiff({ diff, cells, direction, focusedCell });
    			if (!nextCell) return;
    			onFocusCell(nextCell.index);
    		}
    	}

    	function onFlipDirection() {
    		const newDirection = focusedDirection === "across" ? "down" : "across";
    		const hasClueInNewDirection = !!focusedCell["clueNumbers"][newDirection];
    		if (hasClueInNewDirection) $$invalidate(16, focusedDirection = newDirection);
    	}

    	function onKeydown({ detail }) {
    		const diff = detail === "delete" ? -1 : 1;
    		const value = detail === "delete" ? "" : detail;
    		onCellUpdate(focusedCellIndex, value, diff);
    	}

    	const writable_props = [
    		"clues",
    		"cells",
    		"focusedDirection",
    		"focusedCellIndex",
    		"focusedCell",
    		"isRevealing",
    		"isDisableHighlight",
    		"stacked",
    		"revealDuration"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Puzzle> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("clues" in $$props) $$invalidate(17, clues = $$props.clues);
    		if ("cells" in $$props) $$invalidate(0, cells = $$props.cells);
    		if ("focusedDirection" in $$props) $$invalidate(16, focusedDirection = $$props.focusedDirection);
    		if ("focusedCellIndex" in $$props) $$invalidate(1, focusedCellIndex = $$props.focusedCellIndex);
    		if ("focusedCell" in $$props) $$invalidate(18, focusedCell = $$props.focusedCell);
    		if ("isRevealing" in $$props) $$invalidate(2, isRevealing = $$props.isRevealing);
    		if ("isDisableHighlight" in $$props) $$invalidate(3, isDisableHighlight = $$props.isDisableHighlight);
    		if ("stacked" in $$props) $$invalidate(4, stacked = $$props.stacked);
    		if ("revealDuration" in $$props) $$invalidate(5, revealDuration = $$props.revealDuration);
    	};

    	$$self.$capture_state = () => ({
    		Keyboard,
    		getSecondarilyFocusedCells,
    		getCellAfterDiff,
    		Cell,
    		clues,
    		cells,
    		focusedDirection,
    		focusedCellIndex,
    		focusedCell,
    		isRevealing,
    		isDisableHighlight,
    		stacked,
    		revealDuration,
    		cellsHistoryIndex,
    		cellsHistory,
    		focusedCellIndexHistoryIndex,
    		focusedCellIndexHistory,
    		secondarilyFocusedCells,
    		numberOfStatesInHistory,
    		updateSecondarilyFocusedCells,
    		onCellUpdate,
    		onHistoricalChange,
    		onFocusCell,
    		onFocusCellDiff,
    		onFocusClueDiff,
    		onMoveFocus,
    		onFlipDirection,
    		onKeydown,
    		w,
    		h,
    		sortedCellsInDirection
    	});

    	$$self.$inject_state = $$props => {
    		if ("clues" in $$props) $$invalidate(17, clues = $$props.clues);
    		if ("cells" in $$props) $$invalidate(0, cells = $$props.cells);
    		if ("focusedDirection" in $$props) $$invalidate(16, focusedDirection = $$props.focusedDirection);
    		if ("focusedCellIndex" in $$props) $$invalidate(1, focusedCellIndex = $$props.focusedCellIndex);
    		if ("focusedCell" in $$props) $$invalidate(18, focusedCell = $$props.focusedCell);
    		if ("isRevealing" in $$props) $$invalidate(2, isRevealing = $$props.isRevealing);
    		if ("isDisableHighlight" in $$props) $$invalidate(3, isDisableHighlight = $$props.isDisableHighlight);
    		if ("stacked" in $$props) $$invalidate(4, stacked = $$props.stacked);
    		if ("revealDuration" in $$props) $$invalidate(5, revealDuration = $$props.revealDuration);
    		if ("cellsHistoryIndex" in $$props) cellsHistoryIndex = $$props.cellsHistoryIndex;
    		if ("cellsHistory" in $$props) cellsHistory = $$props.cellsHistory;
    		if ("focusedCellIndexHistoryIndex" in $$props) focusedCellIndexHistoryIndex = $$props.focusedCellIndexHistoryIndex;
    		if ("focusedCellIndexHistory" in $$props) focusedCellIndexHistory = $$props.focusedCellIndexHistory;
    		if ("secondarilyFocusedCells" in $$props) $$invalidate(6, secondarilyFocusedCells = $$props.secondarilyFocusedCells);
    		if ("w" in $$props) $$invalidate(7, w = $$props.w);
    		if ("h" in $$props) $$invalidate(8, h = $$props.h);
    		if ("sortedCellsInDirection" in $$props) sortedCellsInDirection = $$props.sortedCellsInDirection;
    	};

    	let w;
    	let h;
    	let sortedCellsInDirection;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*cells*/ 1) {
    			 $$invalidate(7, w = Math.max(...cells.map(d => d.x)) + 1);
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 1) {
    			 $$invalidate(8, h = Math.max(...cells.map(d => d.y)) + 1);
    		}

    		if ($$self.$$.dirty[0] & /*cells, focusedCellIndex, focusedDirection*/ 65539) {
    			 (updateSecondarilyFocusedCells());
    		}

    		if ($$self.$$.dirty[0] & /*cells, focusedDirection*/ 65537) {
    			 sortedCellsInDirection = [...cells].sort((a, b) => focusedDirection == "down"
    			? a.x - b.x || a.y - b.y
    			: a.y - b.y || a.x - b.x);
    		}
    	};

    	return [
    		cells,
    		focusedCellIndex,
    		isRevealing,
    		isDisableHighlight,
    		stacked,
    		revealDuration,
    		secondarilyFocusedCells,
    		w,
    		h,
    		onCellUpdate,
    		onHistoricalChange,
    		onFocusCell,
    		onFocusClueDiff,
    		onMoveFocus,
    		onFlipDirection,
    		onKeydown,
    		focusedDirection,
    		clues,
    		focusedCell
    	];
    }

    class Puzzle extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$3,
    			create_fragment$3,
    			safe_not_equal,
    			{
    				clues: 17,
    				cells: 0,
    				focusedDirection: 16,
    				focusedCellIndex: 1,
    				focusedCell: 18,
    				isRevealing: 2,
    				isDisableHighlight: 3,
    				stacked: 4,
    				revealDuration: 5
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Puzzle",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*clues*/ ctx[17] === undefined && !("clues" in props)) {
    			console.warn("<Puzzle> was created without expected prop 'clues'");
    		}

    		if (/*cells*/ ctx[0] === undefined && !("cells" in props)) {
    			console.warn("<Puzzle> was created without expected prop 'cells'");
    		}

    		if (/*focusedDirection*/ ctx[16] === undefined && !("focusedDirection" in props)) {
    			console.warn("<Puzzle> was created without expected prop 'focusedDirection'");
    		}

    		if (/*focusedCellIndex*/ ctx[1] === undefined && !("focusedCellIndex" in props)) {
    			console.warn("<Puzzle> was created without expected prop 'focusedCellIndex'");
    		}

    		if (/*focusedCell*/ ctx[18] === undefined && !("focusedCell" in props)) {
    			console.warn("<Puzzle> was created without expected prop 'focusedCell'");
    		}

    		if (/*isRevealing*/ ctx[2] === undefined && !("isRevealing" in props)) {
    			console.warn("<Puzzle> was created without expected prop 'isRevealing'");
    		}

    		if (/*isDisableHighlight*/ ctx[3] === undefined && !("isDisableHighlight" in props)) {
    			console.warn("<Puzzle> was created without expected prop 'isDisableHighlight'");
    		}

    		if (/*stacked*/ ctx[4] === undefined && !("stacked" in props)) {
    			console.warn("<Puzzle> was created without expected prop 'stacked'");
    		}
    	}

    	get clues() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clues(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get cells() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set cells(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedDirection() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedDirection(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedCellIndex() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedCellIndex(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedCell() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedCell(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isRevealing() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isRevealing(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDisableHighlight() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDisableHighlight(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stacked() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stacked(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get revealDuration() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set revealDuration(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var scrollTo = (node, isFocused) => {
      return {
        update(newIsFocused) {
          isFocused = newIsFocused;
          if (!isFocused) return;
          const list = node.parentElement.parentElement;
          if (!list) return;

          const top = node.offsetTop;
          const currentYTop = list.scrollTop;
          const currentYBottom = currentYTop + list.clientHeight;
          const buffer = 50;
          if (top < currentYTop + buffer || top > currentYBottom - buffer) {
            list.scrollTo({ top: top, behavior: "smooth" });
          }
        },
      };
    };

    /* Users/russell/Documents/svelte-crossword/src/Clue.svelte generated by Svelte v3.29.0 */
    const file$4 = "Users/russell/Documents/svelte-crossword/src/Clue.svelte";

    function create_fragment$4(ctx) {
    	let li;
    	let button;
    	let t0;
    	let t1;
    	let t2;
    	let scrollTo_action;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			li = element("li");
    			button = element("button");
    			t0 = text(/*number*/ ctx[0]);
    			t1 = text(".\n    ");
    			t2 = text(/*clue*/ ctx[1]);
    			attr_dev(button, "class", "clue svelte-1i661i1");
    			toggle_class(button, "is-number-focused", /*isNumberFocused*/ ctx[3]);
    			toggle_class(button, "is-direction-focused", /*isDirectionFocused*/ ctx[4]);
    			toggle_class(button, "is-filled", /*isFilled*/ ctx[2]);
    			add_location(button, file$4, 16, 2, 349);
    			add_location(li, file$4, 15, 0, 293);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, button);
    			append_dev(button, t0);
    			append_dev(button, t1);
    			append_dev(button, t2);
    			/*li_binding*/ ctx[8](li);

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						button,
    						"click",
    						function () {
    							if (is_function(/*onFocus*/ ctx[5])) /*onFocus*/ ctx[5].apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					),
    					action_destroyer(scrollTo_action = scrollTo.call(null, li, /*isFocused*/ ctx[7]))
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;
    			if (dirty & /*number*/ 1) set_data_dev(t0, /*number*/ ctx[0]);
    			if (dirty & /*clue*/ 2) set_data_dev(t2, /*clue*/ ctx[1]);

    			if (dirty & /*isNumberFocused*/ 8) {
    				toggle_class(button, "is-number-focused", /*isNumberFocused*/ ctx[3]);
    			}

    			if (dirty & /*isDirectionFocused*/ 16) {
    				toggle_class(button, "is-direction-focused", /*isDirectionFocused*/ ctx[4]);
    			}

    			if (dirty & /*isFilled*/ 4) {
    				toggle_class(button, "is-filled", /*isFilled*/ ctx[2]);
    			}

    			if (scrollTo_action && is_function(scrollTo_action.update) && dirty & /*isFocused*/ 128) scrollTo_action.update.call(null, /*isFocused*/ ctx[7]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			/*li_binding*/ ctx[8](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Clue", slots, []);
    	let { number } = $$props;
    	let { clue } = $$props;
    	let { isFilled } = $$props;
    	let { isNumberFocused = false } = $$props;
    	let { isDirectionFocused = false } = $$props;

    	let { onFocus = () => {
    		
    	} } = $$props;

    	let element;

    	const writable_props = [
    		"number",
    		"clue",
    		"isFilled",
    		"isNumberFocused",
    		"isDirectionFocused",
    		"onFocus"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Clue> was created with unknown prop '${key}'`);
    	});

    	function li_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			element = $$value;
    			$$invalidate(6, element);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("number" in $$props) $$invalidate(0, number = $$props.number);
    		if ("clue" in $$props) $$invalidate(1, clue = $$props.clue);
    		if ("isFilled" in $$props) $$invalidate(2, isFilled = $$props.isFilled);
    		if ("isNumberFocused" in $$props) $$invalidate(3, isNumberFocused = $$props.isNumberFocused);
    		if ("isDirectionFocused" in $$props) $$invalidate(4, isDirectionFocused = $$props.isDirectionFocused);
    		if ("onFocus" in $$props) $$invalidate(5, onFocus = $$props.onFocus);
    	};

    	$$self.$capture_state = () => ({
    		scrollTo,
    		number,
    		clue,
    		isFilled,
    		isNumberFocused,
    		isDirectionFocused,
    		onFocus,
    		element,
    		isFocused
    	});

    	$$self.$inject_state = $$props => {
    		if ("number" in $$props) $$invalidate(0, number = $$props.number);
    		if ("clue" in $$props) $$invalidate(1, clue = $$props.clue);
    		if ("isFilled" in $$props) $$invalidate(2, isFilled = $$props.isFilled);
    		if ("isNumberFocused" in $$props) $$invalidate(3, isNumberFocused = $$props.isNumberFocused);
    		if ("isDirectionFocused" in $$props) $$invalidate(4, isDirectionFocused = $$props.isDirectionFocused);
    		if ("onFocus" in $$props) $$invalidate(5, onFocus = $$props.onFocus);
    		if ("element" in $$props) $$invalidate(6, element = $$props.element);
    		if ("isFocused" in $$props) $$invalidate(7, isFocused = $$props.isFocused);
    	};

    	let isFocused;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*isNumberFocused*/ 8) {
    			 $$invalidate(7, isFocused = isNumberFocused);
    		}
    	};

    	return [
    		number,
    		clue,
    		isFilled,
    		isNumberFocused,
    		isDirectionFocused,
    		onFocus,
    		element,
    		isFocused,
    		li_binding
    	];
    }

    class Clue extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			number: 0,
    			clue: 1,
    			isFilled: 2,
    			isNumberFocused: 3,
    			isDirectionFocused: 4,
    			onFocus: 5
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Clue",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*number*/ ctx[0] === undefined && !("number" in props)) {
    			console.warn("<Clue> was created without expected prop 'number'");
    		}

    		if (/*clue*/ ctx[1] === undefined && !("clue" in props)) {
    			console.warn("<Clue> was created without expected prop 'clue'");
    		}

    		if (/*isFilled*/ ctx[2] === undefined && !("isFilled" in props)) {
    			console.warn("<Clue> was created without expected prop 'isFilled'");
    		}
    	}

    	get number() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set number(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get clue() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clue(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFilled() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFilled(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isNumberFocused() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isNumberFocused(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDirectionFocused() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDirectionFocused(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onFocus() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onFocus(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/russell/Documents/svelte-crossword/src/ClueList.svelte generated by Svelte v3.29.0 */
    const file$5 = "Users/russell/Documents/svelte-crossword/src/ClueList.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (14:4) {#each clues as clue}
    function create_each_block$3(ctx) {
    	let clue;
    	let current;

    	function func(...args) {
    		return /*func*/ ctx[5](/*clue*/ ctx[6], ...args);
    	}

    	clue = new Clue({
    			props: {
    				clue: /*clue*/ ctx[6].clue,
    				number: /*clue*/ ctx[6].number,
    				isFilled: /*clue*/ ctx[6].isFilled,
    				isNumberFocused: /*focusedClueNumbers*/ ctx[2][/*direction*/ ctx[0]] === /*clue*/ ctx[6].number,
    				isDirectionFocused: /*isDirectionFocused*/ ctx[3],
    				onFocus: func
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(clue.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(clue, target, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const clue_changes = {};
    			if (dirty & /*clues*/ 2) clue_changes.clue = /*clue*/ ctx[6].clue;
    			if (dirty & /*clues*/ 2) clue_changes.number = /*clue*/ ctx[6].number;
    			if (dirty & /*clues*/ 2) clue_changes.isFilled = /*clue*/ ctx[6].isFilled;
    			if (dirty & /*focusedClueNumbers, direction, clues*/ 7) clue_changes.isNumberFocused = /*focusedClueNumbers*/ ctx[2][/*direction*/ ctx[0]] === /*clue*/ ctx[6].number;
    			if (dirty & /*isDirectionFocused*/ 8) clue_changes.isDirectionFocused = /*isDirectionFocused*/ ctx[3];
    			if (dirty & /*onClueFocus, clues*/ 18) clue_changes.onFocus = func;
    			clue.$set(clue_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(clue.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(clue.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(clue, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(14:4) {#each clues as clue}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let p;
    	let t0;
    	let t1;
    	let div;
    	let ul;
    	let current;
    	let each_value = /*clues*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			p = element("p");
    			t0 = text(/*direction*/ ctx[0]);
    			t1 = space();
    			div = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(p, "class", "svelte-1k6v3oi");
    			add_location(p, file$5, 10, 0, 193);
    			attr_dev(ul, "class", "svelte-1k6v3oi");
    			add_location(ul, file$5, 12, 2, 233);
    			attr_dev(div, "class", "list svelte-1k6v3oi");
    			add_location(div, file$5, 11, 0, 212);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t0);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div, anchor);
    			append_dev(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*direction*/ 1) set_data_dev(t0, /*direction*/ ctx[0]);

    			if (dirty & /*clues, focusedClueNumbers, direction, isDirectionFocused, onClueFocus*/ 31) {
    				each_value = /*clues*/ ctx[1];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("ClueList", slots, []);
    	let { direction } = $$props;
    	let { clues } = $$props;
    	let { focusedClueNumbers } = $$props;
    	let { isDirectionFocused } = $$props;
    	let { onClueFocus } = $$props;

    	const writable_props = [
    		"direction",
    		"clues",
    		"focusedClueNumbers",
    		"isDirectionFocused",
    		"onClueFocus"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<ClueList> was created with unknown prop '${key}'`);
    	});

    	const func = clue => onClueFocus(clue);

    	$$self.$$set = $$props => {
    		if ("direction" in $$props) $$invalidate(0, direction = $$props.direction);
    		if ("clues" in $$props) $$invalidate(1, clues = $$props.clues);
    		if ("focusedClueNumbers" in $$props) $$invalidate(2, focusedClueNumbers = $$props.focusedClueNumbers);
    		if ("isDirectionFocused" in $$props) $$invalidate(3, isDirectionFocused = $$props.isDirectionFocused);
    		if ("onClueFocus" in $$props) $$invalidate(4, onClueFocus = $$props.onClueFocus);
    	};

    	$$self.$capture_state = () => ({
    		Clue,
    		direction,
    		clues,
    		focusedClueNumbers,
    		isDirectionFocused,
    		onClueFocus
    	});

    	$$self.$inject_state = $$props => {
    		if ("direction" in $$props) $$invalidate(0, direction = $$props.direction);
    		if ("clues" in $$props) $$invalidate(1, clues = $$props.clues);
    		if ("focusedClueNumbers" in $$props) $$invalidate(2, focusedClueNumbers = $$props.focusedClueNumbers);
    		if ("isDirectionFocused" in $$props) $$invalidate(3, isDirectionFocused = $$props.isDirectionFocused);
    		if ("onClueFocus" in $$props) $$invalidate(4, onClueFocus = $$props.onClueFocus);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [direction, clues, focusedClueNumbers, isDirectionFocused, onClueFocus, func];
    }

    class ClueList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			direction: 0,
    			clues: 1,
    			focusedClueNumbers: 2,
    			isDirectionFocused: 3,
    			onClueFocus: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ClueList",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*direction*/ ctx[0] === undefined && !("direction" in props)) {
    			console.warn("<ClueList> was created without expected prop 'direction'");
    		}

    		if (/*clues*/ ctx[1] === undefined && !("clues" in props)) {
    			console.warn("<ClueList> was created without expected prop 'clues'");
    		}

    		if (/*focusedClueNumbers*/ ctx[2] === undefined && !("focusedClueNumbers" in props)) {
    			console.warn("<ClueList> was created without expected prop 'focusedClueNumbers'");
    		}

    		if (/*isDirectionFocused*/ ctx[3] === undefined && !("isDirectionFocused" in props)) {
    			console.warn("<ClueList> was created without expected prop 'isDirectionFocused'");
    		}

    		if (/*onClueFocus*/ ctx[4] === undefined && !("onClueFocus" in props)) {
    			console.warn("<ClueList> was created without expected prop 'onClueFocus'");
    		}
    	}

    	get direction() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set direction(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get clues() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clues(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedClueNumbers() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedClueNumbers(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDirectionFocused() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDirectionFocused(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onClueFocus() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onClueFocus(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/russell/Documents/svelte-crossword/src/ClueBar.svelte generated by Svelte v3.29.0 */
    const file$6 = "Users/russell/Documents/svelte-crossword/src/ClueBar.svelte";

    function create_fragment$6(ctx) {
    	let div;
    	let button0;
    	let svg0;
    	let polyline0;
    	let t0;
    	let p;
    	let t1;
    	let t2;
    	let button1;
    	let svg1;
    	let polyline1;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			button0 = element("button");
    			svg0 = svg_element("svg");
    			polyline0 = svg_element("polyline");
    			t0 = space();
    			p = element("p");
    			t1 = text(/*clue*/ ctx[1]);
    			t2 = space();
    			button1 = element("button");
    			svg1 = svg_element("svg");
    			polyline1 = svg_element("polyline");
    			attr_dev(polyline0, "points", "15 18 9 12 15 6");
    			add_location(polyline0, file$6, 19, 43, 507);
    			attr_dev(svg0, "width", "24");
    			attr_dev(svg0, "height", "24");
    			attr_dev(svg0, "viewBox", "0 0 24 24");
    			attr_dev(svg0, "fill", "none");
    			attr_dev(svg0, "stroke", "currentColor");
    			attr_dev(svg0, "stroke-width", "2");
    			attr_dev(svg0, "stroke-linecap", "round");
    			attr_dev(svg0, "stroke-linejoin", "round");
    			attr_dev(svg0, "class", "feather feather-chevron-left");
    			add_location(svg0, file$6, 10, 4, 270);
    			attr_dev(button0, "class", "svelte-1k30qnz");
    			add_location(button0, file$6, 9, 2, 194);
    			attr_dev(p, "class", "svelte-1k30qnz");
    			add_location(p, file$6, 22, 2, 582);
    			attr_dev(polyline1, "points", "9 18 15 12 9 6");
    			add_location(polyline1, file$6, 33, 44, 912);
    			attr_dev(svg1, "width", "24");
    			attr_dev(svg1, "height", "24");
    			attr_dev(svg1, "viewBox", "0 0 24 24");
    			attr_dev(svg1, "fill", "none");
    			attr_dev(svg1, "stroke", "currentColor");
    			attr_dev(svg1, "stroke-width", "2");
    			attr_dev(svg1, "stroke-linecap", "round");
    			attr_dev(svg1, "stroke-linejoin", "round");
    			attr_dev(svg1, "class", "feather feather-chevron-right");
    			add_location(svg1, file$6, 24, 4, 674);
    			attr_dev(button1, "class", "svelte-1k30qnz");
    			add_location(button1, file$6, 23, 2, 598);
    			attr_dev(div, "class", "bar svelte-1k30qnz");
    			add_location(div, file$6, 8, 0, 174);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, button0);
    			append_dev(button0, svg0);
    			append_dev(svg0, polyline0);
    			append_dev(div, t0);
    			append_dev(div, p);
    			append_dev(p, t1);
    			append_dev(div, t2);
    			append_dev(div, button1);
    			append_dev(button1, svg1);
    			append_dev(svg1, polyline1);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[3], false, false, false),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[4], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*clue*/ 2) set_data_dev(t1, /*clue*/ ctx[1]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("ClueBar", slots, []);
    	const dispatch = createEventDispatcher();
    	let { currentClue } = $$props;
    	const writable_props = ["currentClue"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<ClueBar> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => dispatch("nextClue", currentClue.index - 1);
    	const click_handler_1 = () => dispatch("nextClue", currentClue.index + 1);

    	$$self.$$set = $$props => {
    		if ("currentClue" in $$props) $$invalidate(0, currentClue = $$props.currentClue);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		dispatch,
    		currentClue,
    		clue
    	});

    	$$self.$inject_state = $$props => {
    		if ("currentClue" in $$props) $$invalidate(0, currentClue = $$props.currentClue);
    		if ("clue" in $$props) $$invalidate(1, clue = $$props.clue);
    	};

    	let clue;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*currentClue*/ 1) {
    			 $$invalidate(1, clue = currentClue["clue"]);
    		}
    	};

    	return [currentClue, clue, dispatch, click_handler, click_handler_1];
    }

    class ClueBar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { currentClue: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ClueBar",
    			options,
    			id: create_fragment$6.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*currentClue*/ ctx[0] === undefined && !("currentClue" in props)) {
    			console.warn("<ClueBar> was created without expected prop 'currentClue'");
    		}
    	}

    	get currentClue() {
    		throw new Error("<ClueBar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set currentClue(value) {
    		throw new Error("<ClueBar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/russell/Documents/svelte-crossword/src/Clues.svelte generated by Svelte v3.29.0 */
    const file$7 = "Users/russell/Documents/svelte-crossword/src/Clues.svelte";

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	return child_ctx;
    }

    // (38:2) {:else}
    function create_else_block$1(ctx) {
    	let div;
    	let current;
    	let each_value = ["across", "down"];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < 2; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < 2; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "clues--list");
    			add_location(div, file$7, 38, 4, 1015);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < 2; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*focusedClueNumbers, clues, focusedDirection, onClueFocus*/ 43) {
    				each_value = ["across", "down"];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < 2; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div, null);
    					}
    				}

    				group_outros();

    				for (i = 2; i < 2; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < 2; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < 2; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(38:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (34:2) {#if stacked}
    function create_if_block$3(ctx) {
    	let div;
    	let cluebar;
    	let current;

    	cluebar = new ClueBar({
    			props: { currentClue: /*currentClue*/ ctx[4] },
    			$$inline: true
    		});

    	cluebar.$on("nextClue", /*onNextClue*/ ctx[6]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(cluebar.$$.fragment);
    			attr_dev(div, "class", "clues--stacked svelte-xxpthd");
    			add_location(div, file$7, 34, 4, 888);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(cluebar, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const cluebar_changes = {};
    			if (dirty & /*currentClue*/ 16) cluebar_changes.currentClue = /*currentClue*/ ctx[4];
    			cluebar.$set(cluebar_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(cluebar.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(cluebar.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(cluebar);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(34:2) {#if stacked}",
    		ctx
    	});

    	return block;
    }

    // (40:6) {#each ['across', 'down'] as direction}
    function create_each_block$4(ctx) {
    	let cluelist;
    	let current;

    	function func(...args) {
    		return /*func*/ ctx[10](/*direction*/ ctx[11], ...args);
    	}

    	cluelist = new ClueList({
    			props: {
    				direction: /*direction*/ ctx[11],
    				focusedClueNumbers: /*focusedClueNumbers*/ ctx[3],
    				clues: /*clues*/ ctx[1].filter(func),
    				isDirectionFocused: /*focusedDirection*/ ctx[0] === /*direction*/ ctx[11],
    				onClueFocus: /*onClueFocus*/ ctx[5]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(cluelist.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(cluelist, target, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const cluelist_changes = {};
    			if (dirty & /*focusedClueNumbers*/ 8) cluelist_changes.focusedClueNumbers = /*focusedClueNumbers*/ ctx[3];
    			if (dirty & /*clues*/ 2) cluelist_changes.clues = /*clues*/ ctx[1].filter(func);
    			if (dirty & /*focusedDirection*/ 1) cluelist_changes.isDirectionFocused = /*focusedDirection*/ ctx[0] === /*direction*/ ctx[11];
    			cluelist.$set(cluelist_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(cluelist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(cluelist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(cluelist, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$4.name,
    		type: "each",
    		source: "(40:6) {#each ['across', 'down'] as direction}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let section;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block$3, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*stacked*/ ctx[2]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			section = element("section");
    			if_block.c();
    			attr_dev(section, "class", "clues svelte-xxpthd");
    			toggle_class(section, "stacked", /*stacked*/ ctx[2]);
    			add_location(section, file$7, 32, 0, 830);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			if_blocks[current_block_type_index].m(section, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(section, null);
    			}

    			if (dirty & /*stacked*/ 4) {
    				toggle_class(section, "stacked", /*stacked*/ ctx[2]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Clues", slots, []);
    	let { clues } = $$props;
    	let { cellIndexMap } = $$props;
    	let { focusedDirection } = $$props;
    	let { focusedCellIndex } = $$props;
    	let { focusedCell } = $$props;
    	let { stacked } = $$props;

    	function onClueFocus({ direction, id }) {
    		$$invalidate(0, focusedDirection = direction);
    		$$invalidate(7, focusedCellIndex = cellIndexMap[id] || 0);
    	}

    	function onNextClue({ detail }) {
    		let next = detail;
    		if (next < 0) next = clues.length - 1; else if (next > clues.length - 1) next = 0;
    		const { direction, id } = clues[next];
    		onClueFocus({ direction, id });
    	}

    	const writable_props = [
    		"clues",
    		"cellIndexMap",
    		"focusedDirection",
    		"focusedCellIndex",
    		"focusedCell",
    		"stacked"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Clues> was created with unknown prop '${key}'`);
    	});

    	const func = (direction, d) => d.direction === direction;

    	$$self.$$set = $$props => {
    		if ("clues" in $$props) $$invalidate(1, clues = $$props.clues);
    		if ("cellIndexMap" in $$props) $$invalidate(8, cellIndexMap = $$props.cellIndexMap);
    		if ("focusedDirection" in $$props) $$invalidate(0, focusedDirection = $$props.focusedDirection);
    		if ("focusedCellIndex" in $$props) $$invalidate(7, focusedCellIndex = $$props.focusedCellIndex);
    		if ("focusedCell" in $$props) $$invalidate(9, focusedCell = $$props.focusedCell);
    		if ("stacked" in $$props) $$invalidate(2, stacked = $$props.stacked);
    	};

    	$$self.$capture_state = () => ({
    		ClueList,
    		ClueBar,
    		clues,
    		cellIndexMap,
    		focusedDirection,
    		focusedCellIndex,
    		focusedCell,
    		stacked,
    		onClueFocus,
    		onNextClue,
    		focusedClueNumbers,
    		currentClue
    	});

    	$$self.$inject_state = $$props => {
    		if ("clues" in $$props) $$invalidate(1, clues = $$props.clues);
    		if ("cellIndexMap" in $$props) $$invalidate(8, cellIndexMap = $$props.cellIndexMap);
    		if ("focusedDirection" in $$props) $$invalidate(0, focusedDirection = $$props.focusedDirection);
    		if ("focusedCellIndex" in $$props) $$invalidate(7, focusedCellIndex = $$props.focusedCellIndex);
    		if ("focusedCell" in $$props) $$invalidate(9, focusedCell = $$props.focusedCell);
    		if ("stacked" in $$props) $$invalidate(2, stacked = $$props.stacked);
    		if ("focusedClueNumbers" in $$props) $$invalidate(3, focusedClueNumbers = $$props.focusedClueNumbers);
    		if ("currentClue" in $$props) $$invalidate(4, currentClue = $$props.currentClue);
    	};

    	let focusedClueNumbers;
    	let currentClue;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*focusedCell*/ 512) {
    			 $$invalidate(3, focusedClueNumbers = focusedCell.clueNumbers || {});
    		}

    		if ($$self.$$.dirty & /*clues, focusedDirection, focusedClueNumbers*/ 11) {
    			 $$invalidate(4, currentClue = clues.find(c => c.direction === focusedDirection && c.number === focusedClueNumbers[focusedDirection]));
    		}
    	};

    	return [
    		focusedDirection,
    		clues,
    		stacked,
    		focusedClueNumbers,
    		currentClue,
    		onClueFocus,
    		onNextClue,
    		focusedCellIndex,
    		cellIndexMap,
    		focusedCell,
    		func
    	];
    }

    class Clues extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {
    			clues: 1,
    			cellIndexMap: 8,
    			focusedDirection: 0,
    			focusedCellIndex: 7,
    			focusedCell: 9,
    			stacked: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Clues",
    			options,
    			id: create_fragment$7.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*clues*/ ctx[1] === undefined && !("clues" in props)) {
    			console.warn("<Clues> was created without expected prop 'clues'");
    		}

    		if (/*cellIndexMap*/ ctx[8] === undefined && !("cellIndexMap" in props)) {
    			console.warn("<Clues> was created without expected prop 'cellIndexMap'");
    		}

    		if (/*focusedDirection*/ ctx[0] === undefined && !("focusedDirection" in props)) {
    			console.warn("<Clues> was created without expected prop 'focusedDirection'");
    		}

    		if (/*focusedCellIndex*/ ctx[7] === undefined && !("focusedCellIndex" in props)) {
    			console.warn("<Clues> was created without expected prop 'focusedCellIndex'");
    		}

    		if (/*focusedCell*/ ctx[9] === undefined && !("focusedCell" in props)) {
    			console.warn("<Clues> was created without expected prop 'focusedCell'");
    		}

    		if (/*stacked*/ ctx[2] === undefined && !("stacked" in props)) {
    			console.warn("<Clues> was created without expected prop 'stacked'");
    		}
    	}

    	get clues() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clues(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get cellIndexMap() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set cellIndexMap(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedDirection() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedDirection(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedCellIndex() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedCellIndex(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedCell() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedCell(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stacked() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stacked(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function quadIn(t) {
        return t * t;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }

    /* Users/russell/Documents/svelte-crossword/src/Confetti.svelte generated by Svelte v3.29.0 */
    const file$8 = "Users/russell/Documents/svelte-crossword/src/Confetti.svelte";

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i][0];
    	child_ctx[9] = list[i][1];
    	child_ctx[10] = list[i][2];
    	child_ctx[12] = i;
    	return child_ctx;
    }

    // (45:2) {#each allElements as [element, color, scale], i}
    function create_each_block$5(ctx) {
    	let g1;
    	let g0;
    	let raw_value = /*element*/ ctx[8] + "";
    	let g0_fill_value;
    	let g0_style_value;

    	const block = {
    		c: function create() {
    			g1 = svg_element("g");
    			g0 = svg_element("g");
    			attr_dev(g0, "fill", g0_fill_value = /*color*/ ctx[9]);

    			attr_dev(g0, "style", g0_style_value = [
    				`--rotation: ${Math.random() * 360}deg`,
    				`animation-delay: ${quadIn(/*i*/ ctx[12] / /*numberOfElements*/ ctx[0])}s`,
    				`animation-duration: ${/*durationInSeconds*/ ctx[1] * /*randomNumber*/ ctx[2](0.7, 1)}s`
    			].join(";"));

    			attr_dev(g0, "class", "svelte-15wt7c8");
    			add_location(g0, file$8, 46, 6, 2525);
    			set_style(g1, "transform", "scale(" + /*scale*/ ctx[10] + ")");
    			attr_dev(g1, "class", "svelte-15wt7c8");
    			add_location(g1, file$8, 45, 4, 2481);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, g1, anchor);
    			append_dev(g1, g0);
    			g0.innerHTML = raw_value;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*numberOfElements, durationInSeconds*/ 3 && g0_style_value !== (g0_style_value = [
    				`--rotation: ${Math.random() * 360}deg`,
    				`animation-delay: ${quadIn(/*i*/ ctx[12] / /*numberOfElements*/ ctx[0])}s`,
    				`animation-duration: ${/*durationInSeconds*/ ctx[1] * /*randomNumber*/ ctx[2](0.7, 1)}s`
    			].join(";"))) {
    				attr_dev(g0, "style", g0_style_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$5.name,
    		type: "each",
    		source: "(45:2) {#each allElements as [element, color, scale], i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$8(ctx) {
    	let svg;
    	let each_value = /*allElements*/ ctx[3];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(svg, "class", "confetti svelte-15wt7c8");
    			attr_dev(svg, "viewBox", "-10 -10 10 10");
    			add_location(svg, file$8, 43, 0, 2378);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(svg, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*allElements, Math, quadIn, numberOfElements, durationInSeconds, randomNumber*/ 15) {
    				each_value = /*allElements*/ ctx[3];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$5(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$5(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(svg, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Confetti", slots, []);
    	let { numberOfElements = 50 } = $$props;
    	let { durationInSeconds = 2 } = $$props;

    	let { colors = [
    		"#fff",
    		"#c7ecee",
    		"#778beb",
    		"#f7d794",
    		"#63cdda",
    		"#cf6a87",
    		"#e77f67",
    		"#786fa6",
    		"#FDA7DF",
    		"#4b7bec",
    		"#475c83"
    	] } = $$props;

    	const pickFrom = arr => arr[Math.round(Math.random() * arr.length)];
    	const randomNumber = (min, max) => Math.random() * (max - min) + min;
    	const getManyOf = str => new Array(30).fill(0).map(() => str);

    	const elementOptions = [
    		...getManyOf(`<circle r="3" />`),
    		...getManyOf(`<path d="M3.83733 4.73234C4.38961 4.73234 4.83733 4.28463 4.83733 3.73234C4.83733 3.18006 4.38961 2.73234 3.83733 2.73234C3.28505 2.73234 2.83733 3.18006 2.83733 3.73234C2.83733 4.28463 3.28505 4.73234 3.83733 4.73234ZM3.83733 6.73234C5.49418 6.73234 6.83733 5.38919 6.83733 3.73234C6.83733 2.07549 5.49418 0.732341 3.83733 0.732341C2.18048 0.732341 0.83733 2.07549 0.83733 3.73234C0.83733 5.38919 2.18048 6.73234 3.83733 6.73234Z" />`),
    		...getManyOf(`<path d="M4.29742 2.26041C3.86864 2.1688 3.20695 2.21855 2.13614 3.0038C1.69078 3.33041 1.06498 3.23413 0.738375 2.78876C0.411774 2.3434 0.508051 1.7176 0.953417 1.39099C2.32237 0.387097 3.55827 0.0573281 4.71534 0.304565C5.80081 0.536504 6.61625 1.24716 7.20541 1.78276C7.28295 1.85326 7.35618 1.92051 7.4263 1.9849C7.64841 2.18888 7.83929 2.36418 8.03729 2.52315C8.29108 2.72692 8.48631 2.8439 8.64952 2.90181C8.7915 2.95219 8.91895 2.96216 9.07414 2.92095C9.24752 2.8749 9.5134 2.7484 9.88467 2.42214C10.2995 2.05757 10.9314 2.09833 11.2959 2.51319C11.6605 2.92805 11.6198 3.5599 11.2049 3.92447C10.6816 4.38435 10.1478 4.70514 9.58752 4.85394C9.00909 5.00756 8.469 4.95993 7.9807 4.78667C7.51364 4.62093 7.11587 4.34823 6.78514 4.08268C6.53001 3.87783 6.27248 3.64113 6.04114 3.4285C5.97868 3.37109 5.91814 3.31544 5.86006 3.26264C5.25645 2.7139 4.79779 2.36733 4.29742 2.26041Z" />`),
    		...getManyOf(`<rect width="4" height="4" x="-2" y="-2" />`),
    		`<path d="M -5 5 L 0 -5 L 5 5 Z" />`,
    		...("ABCDEFGHIJKLMNOPQRSTUVWXYZ").split("").map(letter => `<text style="font-weight: 700">${letter}</text>`)
    	];

    	const allElements = new Array(numberOfElements).fill(0).map((_, i) => [pickFrom(elementOptions), pickFrom(colors), Math.random()]);
    	const writable_props = ["numberOfElements", "durationInSeconds", "colors"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Confetti> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("numberOfElements" in $$props) $$invalidate(0, numberOfElements = $$props.numberOfElements);
    		if ("durationInSeconds" in $$props) $$invalidate(1, durationInSeconds = $$props.durationInSeconds);
    		if ("colors" in $$props) $$invalidate(4, colors = $$props.colors);
    	};

    	$$self.$capture_state = () => ({
    		quadIn,
    		numberOfElements,
    		durationInSeconds,
    		colors,
    		pickFrom,
    		randomNumber,
    		getManyOf,
    		elementOptions,
    		allElements
    	});

    	$$self.$inject_state = $$props => {
    		if ("numberOfElements" in $$props) $$invalidate(0, numberOfElements = $$props.numberOfElements);
    		if ("durationInSeconds" in $$props) $$invalidate(1, durationInSeconds = $$props.durationInSeconds);
    		if ("colors" in $$props) $$invalidate(4, colors = $$props.colors);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [numberOfElements, durationInSeconds, randomNumber, allElements, colors];
    }

    class Confetti extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {
    			numberOfElements: 0,
    			durationInSeconds: 1,
    			colors: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Confetti",
    			options,
    			id: create_fragment$8.name
    		});
    	}

    	get numberOfElements() {
    		throw new Error("<Confetti>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set numberOfElements(value) {
    		throw new Error("<Confetti>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get durationInSeconds() {
    		throw new Error("<Confetti>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set durationInSeconds(value) {
    		throw new Error("<Confetti>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get colors() {
    		throw new Error("<Confetti>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set colors(value) {
    		throw new Error("<Confetti>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* Users/russell/Documents/svelte-crossword/src/CompletedMessage.svelte generated by Svelte v3.29.0 */
    const file$9 = "Users/russell/Documents/svelte-crossword/src/CompletedMessage.svelte";
    const get_message_slot_changes = dirty => ({});
    const get_message_slot_context = ctx => ({});

    // (10:0) {#if isOpen}
    function create_if_block$4(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let t0;
    	let button;
    	let t2;
    	let div2_transition;
    	let t3;
    	let div3;
    	let div3_transition;
    	let current;
    	let mounted;
    	let dispose;
    	const message_slot_template = /*#slots*/ ctx[3].message;
    	const message_slot = create_slot(message_slot_template, ctx, /*$$scope*/ ctx[2], get_message_slot_context);
    	const message_slot_or_fallback = message_slot || fallback_block(ctx);
    	let if_block = /*showConfetti*/ ctx[0] && create_if_block_1$1(ctx);

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			if (message_slot_or_fallback) message_slot_or_fallback.c();
    			t0 = space();
    			button = element("button");
    			button.textContent = "View puzzle";
    			t2 = space();
    			if (if_block) if_block.c();
    			t3 = space();
    			div3 = element("div");
    			attr_dev(div0, "class", "message svelte-9a7qrw");
    			add_location(div0, file$9, 12, 6, 266);
    			attr_dev(button, "class", "svelte-9a7qrw");
    			add_location(button, file$9, 18, 6, 388);
    			attr_dev(div1, "class", "content svelte-9a7qrw");
    			add_location(div1, file$9, 11, 4, 238);
    			attr_dev(div2, "class", "completed svelte-9a7qrw");
    			add_location(div2, file$9, 10, 2, 180);
    			attr_dev(div3, "class", "curtain svelte-9a7qrw");
    			add_location(div3, file$9, 27, 2, 572);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, div0);

    			if (message_slot_or_fallback) {
    				message_slot_or_fallback.m(div0, null);
    			}

    			append_dev(div1, t0);
    			append_dev(div1, button);
    			append_dev(div2, t2);
    			if (if_block) if_block.m(div2, null);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, div3, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(button, "click", /*click_handler*/ ctx[4], false, false, false),
    					listen_dev(div3, "click", /*click_handler_1*/ ctx[5], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (message_slot) {
    				if (message_slot.p && dirty & /*$$scope*/ 4) {
    					update_slot(message_slot, message_slot_template, ctx, /*$$scope*/ ctx[2], dirty, get_message_slot_changes, get_message_slot_context);
    				}
    			}

    			if (/*showConfetti*/ ctx[0]) {
    				if (if_block) {
    					if (dirty & /*showConfetti*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div2, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(message_slot_or_fallback, local);
    			transition_in(if_block);

    			add_render_callback(() => {
    				if (!div2_transition) div2_transition = create_bidirectional_transition(div2, fade, { y: 20 }, true);
    				div2_transition.run(1);
    			});

    			add_render_callback(() => {
    				if (!div3_transition) div3_transition = create_bidirectional_transition(div3, fade, { duration: 250 }, true);
    				div3_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(message_slot_or_fallback, local);
    			transition_out(if_block);
    			if (!div2_transition) div2_transition = create_bidirectional_transition(div2, fade, { y: 20 }, false);
    			div2_transition.run(0);
    			if (!div3_transition) div3_transition = create_bidirectional_transition(div3, fade, { duration: 250 }, false);
    			div3_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if (message_slot_or_fallback) message_slot_or_fallback.d(detaching);
    			if (if_block) if_block.d();
    			if (detaching && div2_transition) div2_transition.end();
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div3);
    			if (detaching && div3_transition) div3_transition.end();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(10:0) {#if isOpen}",
    		ctx
    	});

    	return block;
    }

    // (14:29)            
    function fallback_block(ctx) {
    	let h3;

    	const block = {
    		c: function create() {
    			h3 = element("h3");
    			h3.textContent = "You solved it!";
    			attr_dev(h3, "class", "svelte-9a7qrw");
    			add_location(h3, file$9, 14, 10, 328);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h3, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block.name,
    		type: "fallback",
    		source: "(14:29)            ",
    		ctx
    	});

    	return block;
    }

    // (22:4) {#if showConfetti}
    function create_if_block_1$1(ctx) {
    	let div;
    	let confetti;
    	let current;
    	confetti = new Confetti({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(confetti.$$.fragment);
    			attr_dev(div, "class", "confetti svelte-9a7qrw");
    			add_location(div, file$9, 22, 6, 494);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(confetti, div, null);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(confetti.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(confetti.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(confetti);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(22:4) {#if showConfetti}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$9(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*isOpen*/ ctx[1] && create_if_block$4(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*isOpen*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*isOpen*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("CompletedMessage", slots, ['message']);
    	let { showConfetti = true } = $$props;
    	let isOpen = true;
    	const writable_props = ["showConfetti"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<CompletedMessage> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => $$invalidate(1, isOpen = false);
    	const click_handler_1 = () => $$invalidate(1, isOpen = false);

    	$$self.$$set = $$props => {
    		if ("showConfetti" in $$props) $$invalidate(0, showConfetti = $$props.showConfetti);
    		if ("$$scope" in $$props) $$invalidate(2, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({ fade, Confetti, showConfetti, isOpen });

    	$$self.$inject_state = $$props => {
    		if ("showConfetti" in $$props) $$invalidate(0, showConfetti = $$props.showConfetti);
    		if ("isOpen" in $$props) $$invalidate(1, isOpen = $$props.isOpen);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [showConfetti, isOpen, $$scope, slots, click_handler, click_handler_1];
    }

    class CompletedMessage extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, { showConfetti: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CompletedMessage",
    			options,
    			id: create_fragment$9.name
    		});
    	}

    	get showConfetti() {
    		throw new Error("<CompletedMessage>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showConfetti(value) {
    		throw new Error("<CompletedMessage>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function createClues(data) {
    	// determine if 0 or 1 based
    	const minX = Math.min(...data.map(d => d.x));
    	const minY = Math.min(...data.map(d => d.y));
    	const adjust = Math.min(minX, minY);

    	
    	const withAdjust = data.map(d => ({
    		...d,
    		x: d.x - adjust,
    		y: d.y - adjust
    	}));

      const withId = withAdjust.map((d, i) => ({
    		...d,
        id: `${d.x}-${d.y}`,
      }));
    	
      // sort asc by start position of clue so we have proper clue ordering
      withId.sort((a, b) => a.y - b.y || a.x - b.x);

      // create a lookup to store clue number (and reuse if same start pos)
      let lookup = {};
      let currentNumber = 1;

      const withNumber = withId.map((d) => {
        let number;
        if (lookup[d.id]) number = lookup[d.id];
        else {
          lookup[d.id] = number = currentNumber;
          currentNumber += 1;
        }
        return {
          ...d,
          number,
        };
      });


    	// create cells for each letter
    	const withCells = withNumber.map(d => {
    		const chars = d.answer.split("");
        const cells = chars.map((answer, i) => {
          const x = d.x + (d.direction === "across" ? i : 0);
          const y = d.y + (d.direction === "down" ? i : 0);
          const number = i === 0 ? d.number : "";
          const clueNumbers = { [d.direction]: d.number };
          const id = `${x}-${y}`;
          const value = "";
          const custom = d.custom || "";
          return {
            id,
            number,
            clueNumbers,
            x,
            y,
            value,
            answer: answer.toUpperCase(),
            custom,
          };
        });
    		return {
    			...d,
    			cells
    		}
    	});

    	withCells.sort((a, b) => {
    		if (a.direction < b.direction) return -1;
    		else if (a.direction > b.direction) return 1;
    		return a.number - b.number;
    	});
    	const withIndex = withCells.map((d, i) => ({
    		...d,
    		index: i
    	}));
    	return withIndex;
    }

    function createCells(data) {
      const cells = [].concat(...data.map(d => d.cells));
      let dict = {};

      // sort so that ones with number values come first and dedupe
      cells.sort((a, b) => a.y - b.y || a.x - b.x || b.number - a.number);
      cells.forEach((d) => {
        if (!dict[d.id]) {
          dict[d.id] = d;
        } else {
          // consolidate clue numbers for across & down
          dict[d.id].clueNumbers = {
            ...d.clueNumbers,
            ...dict[d.id].clueNumbers,
          };
          // consolidate custom classes
          if (dict[d.id].custom !== d.custom)
            dict[d.id].custom = `${dict[d.id].custom} ${d.custom}`;
        }
      });

      const unique = Object.keys(dict).map((d) => dict[d]);
      unique.sort((a, b) => a.y - b.y || a.x - b.x);
      // add index
      const output = unique.map((d, i) => ({ ...d, index: i }));
      return output;
    }

    function validateClues(data) {
    	const props = [
        {
          prop: "clue",
          type: "string",
        },
        {
          prop: "answer",
          type: "string",
        },
        {
          prop: "x",
          type: "number",
        },
        {
          prop: "y",
          type: "number",
        }
      ];

    	// only store if they fail
    	let failedProp = false;
      data.forEach(d => !!props.map(p => {
    		const f = typeof d[p.prop] !== p.type;
    		if (f) {
    			failedProp = true;
    			console.error(`"${p.prop}" is not a ${p.type}\n`, d);
    		}
    	}));

    	let failedCell = false;
    	const cells = [].concat(...data.map(d => d.cells));
    	
    	let dict = {};
    	cells.forEach((d) => {
        if (!dict[d.id]) {
          dict[d.id] = d.answer;
        } else {
    			if (dict[d.id] !== d.answer) {
    				failedCell = true;
    				console.error(`cell "${d.id}" has two different values\n`, `${dict[d.id]} and ${d.answer}`);
    			}
    		}
      });

    	return !failedProp && !failedCell;
    }

    function fromPairs(arr) {
      let res = {};
      arr.forEach((d) => {
        res[d[0]] = d[1];
      });
      return res;
    }

    /* Users/russell/Documents/svelte-crossword/src/Crossword.svelte generated by Svelte v3.29.0 */
    const file$a = "Users/russell/Documents/svelte-crossword/src/Crossword.svelte";
    const get_complete_slot_changes = dirty => ({});
    const get_complete_slot_context = ctx => ({});
    const get_toolbar_slot_changes = dirty => ({});

    const get_toolbar_slot_context = ctx => ({
    	onClear: /*onClear*/ ctx[17],
    	onReveal: /*onReveal*/ ctx[18]
    });

    // (108:0) {#if validated}
    function create_if_block$5(ctx) {
    	let article;
    	let t0;
    	let div;
    	let clues_1;
    	let updating_focusedCellIndex;
    	let updating_focusedCell;
    	let updating_focusedDirection;
    	let t1;
    	let puzzle;
    	let updating_cells;
    	let updating_focusedCellIndex_1;
    	let updating_focusedDirection_1;
    	let t2;
    	let article_class_value;
    	let article_resize_listener;
    	let current;
    	const toolbar_slot_template = /*#slots*/ ctx[25].toolbar;
    	const toolbar_slot = create_slot(toolbar_slot_template, ctx, /*$$scope*/ ctx[33], get_toolbar_slot_context);
    	const toolbar_slot_or_fallback = toolbar_slot || fallback_block$1(ctx);

    	function clues_1_focusedCellIndex_binding(value) {
    		/*clues_1_focusedCellIndex_binding*/ ctx[26].call(null, value);
    	}

    	function clues_1_focusedCell_binding(value) {
    		/*clues_1_focusedCell_binding*/ ctx[27].call(null, value);
    	}

    	function clues_1_focusedDirection_binding(value) {
    		/*clues_1_focusedDirection_binding*/ ctx[28].call(null, value);
    	}

    	let clues_1_props = {
    		clues: /*clues*/ ctx[10],
    		cellIndexMap: /*cellIndexMap*/ ctx[12],
    		stacked: /*stacked*/ ctx[16]
    	};

    	if (/*focusedCellIndex*/ ctx[6] !== void 0) {
    		clues_1_props.focusedCellIndex = /*focusedCellIndex*/ ctx[6];
    	}

    	if (/*focusedCell*/ ctx[11] !== void 0) {
    		clues_1_props.focusedCell = /*focusedCell*/ ctx[11];
    	}

    	if (/*focusedDirection*/ ctx[5] !== void 0) {
    		clues_1_props.focusedDirection = /*focusedDirection*/ ctx[5];
    	}

    	clues_1 = new Clues({ props: clues_1_props, $$inline: true });
    	binding_callbacks.push(() => bind(clues_1, "focusedCellIndex", clues_1_focusedCellIndex_binding));
    	binding_callbacks.push(() => bind(clues_1, "focusedCell", clues_1_focusedCell_binding));
    	binding_callbacks.push(() => bind(clues_1, "focusedDirection", clues_1_focusedDirection_binding));

    	function puzzle_cells_binding(value) {
    		/*puzzle_cells_binding*/ ctx[29].call(null, value);
    	}

    	function puzzle_focusedCellIndex_binding(value) {
    		/*puzzle_focusedCellIndex_binding*/ ctx[30].call(null, value);
    	}

    	function puzzle_focusedDirection_binding(value) {
    		/*puzzle_focusedDirection_binding*/ ctx[31].call(null, value);
    	}

    	let puzzle_props = {
    		clues: /*clues*/ ctx[10],
    		focusedCell: /*focusedCell*/ ctx[11],
    		isRevealing: /*isRevealing*/ ctx[7],
    		isDisableHighlight: /*isDisableHighlight*/ ctx[15],
    		revealDuration: /*revealDuration*/ ctx[1],
    		stacked: /*stacked*/ ctx[16]
    	};

    	if (/*cells*/ ctx[8] !== void 0) {
    		puzzle_props.cells = /*cells*/ ctx[8];
    	}

    	if (/*focusedCellIndex*/ ctx[6] !== void 0) {
    		puzzle_props.focusedCellIndex = /*focusedCellIndex*/ ctx[6];
    	}

    	if (/*focusedDirection*/ ctx[5] !== void 0) {
    		puzzle_props.focusedDirection = /*focusedDirection*/ ctx[5];
    	}

    	puzzle = new Puzzle({ props: puzzle_props, $$inline: true });
    	binding_callbacks.push(() => bind(puzzle, "cells", puzzle_cells_binding));
    	binding_callbacks.push(() => bind(puzzle, "focusedCellIndex", puzzle_focusedCellIndex_binding));
    	binding_callbacks.push(() => bind(puzzle, "focusedDirection", puzzle_focusedDirection_binding));
    	let if_block = /*isComplete*/ ctx[13] && !/*isRevealing*/ ctx[7] && /*showCompleteMessage*/ ctx[2] && create_if_block_1$2(ctx);

    	const block = {
    		c: function create() {
    			article = element("article");
    			if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.c();
    			t0 = space();
    			div = element("div");
    			create_component(clues_1.$$.fragment);
    			t1 = space();
    			create_component(puzzle.$$.fragment);
    			t2 = space();
    			if (if_block) if_block.c();
    			attr_dev(div, "class", "play svelte-1ein5he");
    			toggle_class(div, "stacked", /*stacked*/ ctx[16]);
    			add_location(div, file$a, 113, 4, 3235);
    			attr_dev(article, "class", article_class_value = "crossword " + /*themeClass*/ ctx[14] + " svelte-1ein5he");
    			add_render_callback(() => /*article_elementresize_handler*/ ctx[32].call(article));
    			add_location(article, file$a, 108, 2, 3016);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, article, anchor);

    			if (toolbar_slot_or_fallback) {
    				toolbar_slot_or_fallback.m(article, null);
    			}

    			append_dev(article, t0);
    			append_dev(article, div);
    			mount_component(clues_1, div, null);
    			append_dev(div, t1);
    			mount_component(puzzle, div, null);
    			append_dev(article, t2);
    			if (if_block) if_block.m(article, null);
    			article_resize_listener = add_resize_listener(article, /*article_elementresize_handler*/ ctx[32].bind(article));
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (toolbar_slot) {
    				if (toolbar_slot.p && dirty[1] & /*$$scope*/ 4) {
    					update_slot(toolbar_slot, toolbar_slot_template, ctx, /*$$scope*/ ctx[33], dirty, get_toolbar_slot_changes, get_toolbar_slot_context);
    				}
    			} else {
    				if (toolbar_slot_or_fallback && toolbar_slot_or_fallback.p && dirty[0] & /*actions*/ 1) {
    					toolbar_slot_or_fallback.p(ctx, dirty);
    				}
    			}

    			const clues_1_changes = {};
    			if (dirty[0] & /*clues*/ 1024) clues_1_changes.clues = /*clues*/ ctx[10];
    			if (dirty[0] & /*cellIndexMap*/ 4096) clues_1_changes.cellIndexMap = /*cellIndexMap*/ ctx[12];
    			if (dirty[0] & /*stacked*/ 65536) clues_1_changes.stacked = /*stacked*/ ctx[16];

    			if (!updating_focusedCellIndex && dirty[0] & /*focusedCellIndex*/ 64) {
    				updating_focusedCellIndex = true;
    				clues_1_changes.focusedCellIndex = /*focusedCellIndex*/ ctx[6];
    				add_flush_callback(() => updating_focusedCellIndex = false);
    			}

    			if (!updating_focusedCell && dirty[0] & /*focusedCell*/ 2048) {
    				updating_focusedCell = true;
    				clues_1_changes.focusedCell = /*focusedCell*/ ctx[11];
    				add_flush_callback(() => updating_focusedCell = false);
    			}

    			if (!updating_focusedDirection && dirty[0] & /*focusedDirection*/ 32) {
    				updating_focusedDirection = true;
    				clues_1_changes.focusedDirection = /*focusedDirection*/ ctx[5];
    				add_flush_callback(() => updating_focusedDirection = false);
    			}

    			clues_1.$set(clues_1_changes);
    			const puzzle_changes = {};
    			if (dirty[0] & /*clues*/ 1024) puzzle_changes.clues = /*clues*/ ctx[10];
    			if (dirty[0] & /*focusedCell*/ 2048) puzzle_changes.focusedCell = /*focusedCell*/ ctx[11];
    			if (dirty[0] & /*isRevealing*/ 128) puzzle_changes.isRevealing = /*isRevealing*/ ctx[7];
    			if (dirty[0] & /*isDisableHighlight*/ 32768) puzzle_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[15];
    			if (dirty[0] & /*revealDuration*/ 2) puzzle_changes.revealDuration = /*revealDuration*/ ctx[1];
    			if (dirty[0] & /*stacked*/ 65536) puzzle_changes.stacked = /*stacked*/ ctx[16];

    			if (!updating_cells && dirty[0] & /*cells*/ 256) {
    				updating_cells = true;
    				puzzle_changes.cells = /*cells*/ ctx[8];
    				add_flush_callback(() => updating_cells = false);
    			}

    			if (!updating_focusedCellIndex_1 && dirty[0] & /*focusedCellIndex*/ 64) {
    				updating_focusedCellIndex_1 = true;
    				puzzle_changes.focusedCellIndex = /*focusedCellIndex*/ ctx[6];
    				add_flush_callback(() => updating_focusedCellIndex_1 = false);
    			}

    			if (!updating_focusedDirection_1 && dirty[0] & /*focusedDirection*/ 32) {
    				updating_focusedDirection_1 = true;
    				puzzle_changes.focusedDirection = /*focusedDirection*/ ctx[5];
    				add_flush_callback(() => updating_focusedDirection_1 = false);
    			}

    			puzzle.$set(puzzle_changes);

    			if (dirty[0] & /*stacked*/ 65536) {
    				toggle_class(div, "stacked", /*stacked*/ ctx[16]);
    			}

    			if (/*isComplete*/ ctx[13] && !/*isRevealing*/ ctx[7] && /*showCompleteMessage*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*isComplete, isRevealing, showCompleteMessage*/ 8324) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(article, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[0] & /*themeClass*/ 16384 && article_class_value !== (article_class_value = "crossword " + /*themeClass*/ ctx[14] + " svelte-1ein5he")) {
    				attr_dev(article, "class", article_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(toolbar_slot_or_fallback, local);
    			transition_in(clues_1.$$.fragment, local);
    			transition_in(puzzle.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(toolbar_slot_or_fallback, local);
    			transition_out(clues_1.$$.fragment, local);
    			transition_out(puzzle.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(article);
    			if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.d(detaching);
    			destroy_component(clues_1);
    			destroy_component(puzzle);
    			if (if_block) if_block.d();
    			article_resize_listener();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$5.name,
    		type: "if",
    		source: "(108:0) {#if validated}",
    		ctx
    	});

    	return block;
    }

    // (110:67)        
    function fallback_block$1(ctx) {
    	let toolbar;
    	let current;

    	toolbar = new Toolbar({
    			props: { actions: /*actions*/ ctx[0] },
    			$$inline: true
    		});

    	toolbar.$on("event", /*onToolbarEvent*/ ctx[19]);

    	const block = {
    		c: function create() {
    			create_component(toolbar.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(toolbar, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const toolbar_changes = {};
    			if (dirty[0] & /*actions*/ 1) toolbar_changes.actions = /*actions*/ ctx[0];
    			toolbar.$set(toolbar_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(toolbar.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(toolbar.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(toolbar, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block$1.name,
    		type: "fallback",
    		source: "(110:67)        ",
    		ctx
    	});

    	return block;
    }

    // (134:4) {#if isComplete && !isRevealing && showCompleteMessage}
    function create_if_block_1$2(ctx) {
    	let completedmessage;
    	let current;

    	completedmessage = new CompletedMessage({
    			props: {
    				showConfetti: /*showConfetti*/ ctx[3],
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(completedmessage.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(completedmessage, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const completedmessage_changes = {};
    			if (dirty[0] & /*showConfetti*/ 8) completedmessage_changes.showConfetti = /*showConfetti*/ ctx[3];

    			if (dirty[1] & /*$$scope*/ 4) {
    				completedmessage_changes.$$scope = { dirty, ctx };
    			}

    			completedmessage.$set(completedmessage_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(completedmessage.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(completedmessage.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(completedmessage, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(134:4) {#if isComplete && !isRevealing && showCompleteMessage}",
    		ctx
    	});

    	return block;
    }

    // (135:6) <CompletedMessage showConfetti="{showConfetti}">
    function create_default_slot(ctx) {
    	let current;
    	const complete_slot_template = /*#slots*/ ctx[25].complete;
    	const complete_slot = create_slot(complete_slot_template, ctx, /*$$scope*/ ctx[33], get_complete_slot_context);

    	const block = {
    		c: function create() {
    			if (complete_slot) complete_slot.c();
    		},
    		m: function mount(target, anchor) {
    			if (complete_slot) {
    				complete_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (complete_slot) {
    				if (complete_slot.p && dirty[1] & /*$$scope*/ 4) {
    					update_slot(complete_slot, complete_slot_template, ctx, /*$$scope*/ ctx[33], dirty, get_complete_slot_changes, get_complete_slot_context);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(complete_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(complete_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (complete_slot) complete_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(135:6) <CompletedMessage showConfetti=\\\"{showConfetti}\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$a(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*validated*/ ctx[9] && create_if_block$5(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*validated*/ ctx[9]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*validated*/ 512) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$5(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Crossword", slots, ['toolbar','complete']);
    	let { data = [] } = $$props;
    	let { actions = ["clear", "reveal"] } = $$props;
    	let { theme = "classic" } = $$props;
    	let { revealDuration = 1000 } = $$props;
    	let { breakpoint = 720 } = $$props;
    	let { revealed = false } = $$props;
    	let { disableHighlight = false } = $$props;
    	let { showCompleteMessage = true } = $$props;
    	let { showConfetti = true } = $$props;
    	let width = 0;
    	let focusedDirection = "across";
    	let focusedCellIndex = 0;
    	let isRevealing = false;
    	let revealTimeout;
    	let clueCompletion;
    	let cells = [];

    	function checkClues() {
    		return clues.map(d => {
    			const index = d.index;

    			const cellChecks = d.cells.map(c => {
    				const { value } = cells.find(e => e.id === c.id);
    				const hasValue = !!value;
    				const hasCorrect = value === c.answer;
    				return { hasValue, hasCorrect };
    			});

    			const isCorrect = cellChecks.filter(c => c.hasCorrect).length === d.answer.length;
    			const isFilled = cellChecks.filter(c => c.hasValue).length === d.answer.length;
    			return { ...d, isCorrect, isFilled };
    		});
    	}

    	function reset() {
    		$$invalidate(7, isRevealing = false);
    		$$invalidate(6, focusedCellIndex = 0);
    		$$invalidate(5, focusedDirection = "across");
    	}

    	function onClear() {
    		reset();
    		if (revealTimeout) clearTimeout(revealTimeout);
    		$$invalidate(8, cells = cells.map(cell => ({ ...cell, value: "" })));
    		$$invalidate(20, revealed = false);
    	}

    	function onReveal() {
    		if (revealed) return true;
    		reset();
    		$$invalidate(8, cells = cells.map(cell => ({ ...cell, value: cell.answer })));
    		$$invalidate(20, revealed = true);
    		startReveal();
    	}

    	function startReveal() {
    		$$invalidate(7, isRevealing = true);
    		if (revealTimeout) clearTimeout(revealTimeout);

    		revealTimeout = setTimeout(
    			() => {
    				$$invalidate(7, isRevealing = false);
    			},
    			revealDuration + 250
    		);
    	}

    	function onToolbarEvent({ detail }) {
    		if (detail === "clear") onClear(); else if (detail === "reveal") onReveal();
    	}

    	const writable_props = [
    		"data",
    		"actions",
    		"theme",
    		"revealDuration",
    		"breakpoint",
    		"revealed",
    		"disableHighlight",
    		"showCompleteMessage",
    		"showConfetti"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Crossword> was created with unknown prop '${key}'`);
    	});

    	function clues_1_focusedCellIndex_binding(value) {
    		focusedCellIndex = value;
    		$$invalidate(6, focusedCellIndex);
    	}

    	function clues_1_focusedCell_binding(value) {
    		focusedCell = value;
    		(((($$invalidate(11, focusedCell), $$invalidate(8, cells)), $$invalidate(6, focusedCellIndex)), $$invalidate(35, originalClues)), $$invalidate(21, data));
    	}

    	function clues_1_focusedDirection_binding(value) {
    		focusedDirection = value;
    		$$invalidate(5, focusedDirection);
    	}

    	function puzzle_cells_binding(value) {
    		cells = value;
    		(($$invalidate(8, cells), $$invalidate(35, originalClues)), $$invalidate(21, data));
    	}

    	function puzzle_focusedCellIndex_binding(value) {
    		focusedCellIndex = value;
    		$$invalidate(6, focusedCellIndex);
    	}

    	function puzzle_focusedDirection_binding(value) {
    		focusedDirection = value;
    		$$invalidate(5, focusedDirection);
    	}

    	function article_elementresize_handler() {
    		width = this.offsetWidth;
    		$$invalidate(4, width);
    	}

    	$$self.$$set = $$props => {
    		if ("data" in $$props) $$invalidate(21, data = $$props.data);
    		if ("actions" in $$props) $$invalidate(0, actions = $$props.actions);
    		if ("theme" in $$props) $$invalidate(22, theme = $$props.theme);
    		if ("revealDuration" in $$props) $$invalidate(1, revealDuration = $$props.revealDuration);
    		if ("breakpoint" in $$props) $$invalidate(23, breakpoint = $$props.breakpoint);
    		if ("revealed" in $$props) $$invalidate(20, revealed = $$props.revealed);
    		if ("disableHighlight" in $$props) $$invalidate(24, disableHighlight = $$props.disableHighlight);
    		if ("showCompleteMessage" in $$props) $$invalidate(2, showCompleteMessage = $$props.showCompleteMessage);
    		if ("showConfetti" in $$props) $$invalidate(3, showConfetti = $$props.showConfetti);
    		if ("$$scope" in $$props) $$invalidate(33, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		Toolbar,
    		Puzzle,
    		Clues,
    		CompletedMessage,
    		createClues,
    		createCells,
    		validateClues,
    		fromPairs,
    		data,
    		actions,
    		theme,
    		revealDuration,
    		breakpoint,
    		revealed,
    		disableHighlight,
    		showCompleteMessage,
    		showConfetti,
    		width,
    		focusedDirection,
    		focusedCellIndex,
    		isRevealing,
    		revealTimeout,
    		clueCompletion,
    		cells,
    		checkClues,
    		reset,
    		onClear,
    		onReveal,
    		startReveal,
    		onToolbarEvent,
    		originalClues,
    		validated,
    		clues,
    		focusedCell,
    		cellIndexMap,
    		percentCorrect,
    		isComplete,
    		themeClass,
    		isDisableHighlight,
    		stacked
    	});

    	$$self.$inject_state = $$props => {
    		if ("data" in $$props) $$invalidate(21, data = $$props.data);
    		if ("actions" in $$props) $$invalidate(0, actions = $$props.actions);
    		if ("theme" in $$props) $$invalidate(22, theme = $$props.theme);
    		if ("revealDuration" in $$props) $$invalidate(1, revealDuration = $$props.revealDuration);
    		if ("breakpoint" in $$props) $$invalidate(23, breakpoint = $$props.breakpoint);
    		if ("revealed" in $$props) $$invalidate(20, revealed = $$props.revealed);
    		if ("disableHighlight" in $$props) $$invalidate(24, disableHighlight = $$props.disableHighlight);
    		if ("showCompleteMessage" in $$props) $$invalidate(2, showCompleteMessage = $$props.showCompleteMessage);
    		if ("showConfetti" in $$props) $$invalidate(3, showConfetti = $$props.showConfetti);
    		if ("width" in $$props) $$invalidate(4, width = $$props.width);
    		if ("focusedDirection" in $$props) $$invalidate(5, focusedDirection = $$props.focusedDirection);
    		if ("focusedCellIndex" in $$props) $$invalidate(6, focusedCellIndex = $$props.focusedCellIndex);
    		if ("isRevealing" in $$props) $$invalidate(7, isRevealing = $$props.isRevealing);
    		if ("revealTimeout" in $$props) revealTimeout = $$props.revealTimeout;
    		if ("clueCompletion" in $$props) clueCompletion = $$props.clueCompletion;
    		if ("cells" in $$props) $$invalidate(8, cells = $$props.cells);
    		if ("originalClues" in $$props) $$invalidate(35, originalClues = $$props.originalClues);
    		if ("validated" in $$props) $$invalidate(9, validated = $$props.validated);
    		if ("clues" in $$props) $$invalidate(10, clues = $$props.clues);
    		if ("focusedCell" in $$props) $$invalidate(11, focusedCell = $$props.focusedCell);
    		if ("cellIndexMap" in $$props) $$invalidate(12, cellIndexMap = $$props.cellIndexMap);
    		if ("percentCorrect" in $$props) $$invalidate(36, percentCorrect = $$props.percentCorrect);
    		if ("isComplete" in $$props) $$invalidate(13, isComplete = $$props.isComplete);
    		if ("themeClass" in $$props) $$invalidate(14, themeClass = $$props.themeClass);
    		if ("isDisableHighlight" in $$props) $$invalidate(15, isDisableHighlight = $$props.isDisableHighlight);
    		if ("stacked" in $$props) $$invalidate(16, stacked = $$props.stacked);
    	};

    	let originalClues;
    	let validated;
    	let clues;
    	let focusedCell;
    	let cellIndexMap;
    	let percentCorrect;
    	let isComplete;
    	let themeClass;
    	let isDisableHighlight;
    	let stacked;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*data*/ 2097152) {
    			 $$invalidate(35, originalClues = createClues(data));
    		}

    		if ($$self.$$.dirty[1] & /*originalClues*/ 16) {
    			 $$invalidate(9, validated = validateClues(originalClues));
    		}

    		if ($$self.$$.dirty[1] & /*originalClues*/ 16) {
    			 $$invalidate(10, clues = originalClues.map(d => ({ ...d })));
    		}

    		if ($$self.$$.dirty[1] & /*originalClues*/ 16) {
    			 ($$invalidate(8, cells = createCells(originalClues)));
    		}

    		if ($$self.$$.dirty[0] & /*cells, focusedCellIndex*/ 320) {
    			 $$invalidate(11, focusedCell = cells[focusedCellIndex] || {});
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 256) {
    			 $$invalidate(12, cellIndexMap = fromPairs(cells.map(cell => [cell.id, cell.index])));
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 256) {
    			 $$invalidate(36, percentCorrect = cells.filter(d => d.answer === d.value).length / cells.length);
    		}

    		if ($$self.$$.dirty[1] & /*percentCorrect*/ 32) {
    			 $$invalidate(13, isComplete = percentCorrect == 1);
    		}

    		if ($$self.$$.dirty[0] & /*theme*/ 4194304) {
    			 $$invalidate(14, themeClass = theme ? `theme-${theme}` : "");
    		}

    		if ($$self.$$.dirty[0] & /*isComplete, disableHighlight*/ 16785408) {
    			 $$invalidate(15, isDisableHighlight = isComplete && disableHighlight);
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 256) {
    			 ($$invalidate(10, clues = checkClues()));
    		}

    		if ($$self.$$.dirty[0] & /*width, breakpoint*/ 8388624) {
    			 $$invalidate(16, stacked = width < breakpoint);
    		}

    		if ($$self.$$.dirty[1] & /*originalClues*/ 16) {
    			 (reset());
    		}
    	};

    	return [
    		actions,
    		revealDuration,
    		showCompleteMessage,
    		showConfetti,
    		width,
    		focusedDirection,
    		focusedCellIndex,
    		isRevealing,
    		cells,
    		validated,
    		clues,
    		focusedCell,
    		cellIndexMap,
    		isComplete,
    		themeClass,
    		isDisableHighlight,
    		stacked,
    		onClear,
    		onReveal,
    		onToolbarEvent,
    		revealed,
    		data,
    		theme,
    		breakpoint,
    		disableHighlight,
    		slots,
    		clues_1_focusedCellIndex_binding,
    		clues_1_focusedCell_binding,
    		clues_1_focusedDirection_binding,
    		puzzle_cells_binding,
    		puzzle_focusedCellIndex_binding,
    		puzzle_focusedDirection_binding,
    		article_elementresize_handler,
    		$$scope
    	];
    }

    class Crossword extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$a,
    			create_fragment$a,
    			safe_not_equal,
    			{
    				data: 21,
    				actions: 0,
    				theme: 22,
    				revealDuration: 1,
    				breakpoint: 23,
    				revealed: 20,
    				disableHighlight: 24,
    				showCompleteMessage: 2,
    				showConfetti: 3
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Crossword",
    			options,
    			id: create_fragment$a.name
    		});
    	}

    	get data() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get actions() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set actions(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get theme() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set theme(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get revealDuration() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set revealDuration(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get breakpoint() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set breakpoint(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get revealed() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set revealed(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disableHighlight() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disableHighlight(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showCompleteMessage() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showCompleteMessage(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showConfetti() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showConfetti(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var dataNYTMini = [
    	{
    		clue: "The 1% of 1% milk",
    		answer: "FAT",
    		direction: "across",
    		x: 2,
    		y: 0
    	},
    	{
    		clue: "Flicker of light",
    		answer: "GLINT",
    		direction: "across",
    		x: 0,
    		y: 1
    	},
    	{
    		clue: "Really neat",
    		answer: "NIFTY",
    		direction: "across",
    		x: 0,
    		y: 2
    	},
    	{
    		clue: "\"__ we meet again\"",
    		answer: "UNTIL",
    		direction: "across",
    		x: 0,
    		y: 3
    	},
    	{
    		clue: "It's way over your head",
    		answer: "SKY",
    		direction: "across",
    		x: 0,
    		y: 4
    	},
    	{
    		clue: "Point bonus for using all seven tiles in Scrabble",
    		answer: "FIFTY",
    		direction: "down",
    		x: 2,
    		y: 0
    	},
    	{
    		clue: "Opposite of pro-",
    		answer: "ANTI",
    		direction: "down",
    		x: 3,
    		y: 0
    	},
    	{
    		clue: "Texter's \"gotta run\"",
    		answer: "TTYL",
    		direction: "down",
    		x: 4,
    		y: 0
    	},
    	{
    		clue: "Migratory antelopes",
    		answer: "GNUS",
    		direction: "down",
    		x: 0,
    		y: 1
    	},
    	{
    		clue: "Clickable part of a webpage",
    		answer: "LINK",
    		direction: "down",
    		x: 1,
    		y: 1
    	}
    ];

    var dataNYTDaily = [
    	{
    		clue: "Bellyache",
    		answer: "BEEF",
    		direction: "across",
    		x: 0,
    		y: 0
    	},
    	{
    		clue: "What many people have for public speaking",
    		answer: "PHOBIA",
    		direction: "across",
    		x: 5,
    		y: 0
    	},
    	{
    		clue: "\"We ___ loudest when we ___ to ourselves\": Eric Hoffer",
    		answer: "LIE",
    		direction: "across",
    		x: 12,
    		y: 0
    	},
    	{
    		clue: "Taj Mahal city",
    		answer: "AGRA",
    		direction: "across",
    		x: 0,
    		y: 1
    	},
    	{
    		clue: "College in Manhattan",
    		answer: "BARUCH",
    		direction: "across",
    		x: 5,
    		y: 1
    	},
    	{
    		clue: "Halloween time: Abbr.",
    		answer: "OCT",
    		direction: "across",
    		x: 12,
    		y: 1
    	},
    	{
    		clue: "Ways to cross a river in Switzerland?",
    		answer: "BERNBRIDGES",
    		direction: "across",
    		x: 0,
    		y: 2
    	},
    	{
    		clue: "Big expense for some city dwellers",
    		answer: "CAR",
    		direction: "across",
    		x: 12,
    		y: 2
    	},
    	{
    		clue: "Old Glory's land, for short",
    		answer: "USOFA",
    		direction: "across",
    		x: 0,
    		y: 3
    	},
    	{
    		clue: "Funny Brooks",
    		answer: "MEL",
    		direction: "across",
    		x: 6,
    		y: 3
    	},
    	{
    		clue: "Prop for Mr. Peanut",
    		answer: "CANE",
    		direction: "across",
    		x: 11,
    		y: 3
    	},
    	{
    		clue: "Crow, e.g.",
    		answer: "TRIBE",
    		direction: "across",
    		x: 1,
    		y: 4
    	},
    	{
    		clue: "Fixed a mistake at a card table",
    		answer: "REDEALT",
    		direction: "across",
    		x: 7,
    		y: 4
    	},
    	{
    		clue: "First showing at a film festival in France?",
    		answer: "CANNESOPENER",
    		direction: "across",
    		x: 3,
    		y: 5
    	},
    	{
    		clue: "Co. that merged into Verizon",
    		answer: "GTE",
    		direction: "across",
    		x: 0,
    		y: 6
    	},
    	{
    		clue: "Owned",
    		answer: "HAD",
    		direction: "across",
    		x: 5,
    		y: 6
    	},
    	{
    		clue: "___ Conventions",
    		answer: "GENEVA",
    		direction: "across",
    		x: 9,
    		y: 6
    	},
    	{
    		clue: "Supercharge, as an engine",
    		answer: "REV",
    		direction: "across",
    		x: 0,
    		y: 7
    	},
    	{
    		clue: "Lightly touch, as with a handkerchief",
    		answer: "DAB",
    		direction: "across",
    		x: 4,
    		y: 7
    	},
    	{
    		clue: "Wyoming-to-Missouri dir.",
    		answer: "ESE",
    		direction: "across",
    		x: 8,
    		y: 7
    	},
    	{
    		clue: "Chinese dynasty circa A.D. 250",
    		answer: "WEI",
    		direction: "across",
    		x: 12,
    		y: 7
    	},
    	{
    		clue: "Actress Brie of \"Mad Men\"",
    		answer: "ALISON",
    		direction: "across",
    		x: 0,
    		y: 8
    	},
    	{
    		clue: "Colorful fish",
    		answer: "KOI",
    		direction: "across",
    		x: 7,
    		y: 8
    	},
    	{
    		clue: "Creator of sketches, in brief",
    		answer: "SNL",
    		direction: "across",
    		x: 12,
    		y: 8
    	},
    	{
    		clue: "Census taker in India?",
    		answer: "DELHICOUNTER",
    		direction: "across",
    		x: 0,
    		y: 9
    	},
    	{
    		clue: "Like Barack Obama's presidency",
    		answer: "TWOTERM",
    		direction: "across",
    		x: 1,
    		y: 10
    	},
    	{
    		clue: "Loads",
    		answer: "SLEWS",
    		direction: "across",
    		x: 9,
    		y: 10
    	},
    	{
    		clue: "Denny's competitor",
    		answer: "IHOP",
    		direction: "across",
    		x: 0,
    		y: 11
    	},
    	{
    		clue: "Mensa stats",
    		answer: "IQS",
    		direction: "across",
    		x: 6,
    		y: 11
    	},
    	{
    		clue: "Urban sitting spot",
    		answer: "STOOP",
    		direction: "across",
    		x: 10,
    		y: 11
    	},
    	{
    		clue: "Classic tattoo word",
    		answer: "MOM",
    		direction: "across",
    		x: 0,
    		y: 12
    	},
    	{
    		clue: "Police dragnet in South Korea?",
    		answer: "SEOULSEARCH",
    		direction: "across",
    		x: 4,
    		y: 12
    	},
    	{
    		clue: "Spanish article",
    		answer: "UNA",
    		direction: "across",
    		x: 0,
    		y: 13
    	},
    	{
    		clue: "How café may be served",
    		answer: "AULAIT",
    		direction: "across",
    		x: 4,
    		y: 13
    	},
    	{
    		clue: "\"If you're asking me,\" in textspeak",
    		answer: "IMHO",
    		direction: "across",
    		x: 11,
    		y: 13
    	},
    	{
    		clue: "W-2 fig.",
    		answer: "SSN",
    		direction: "across",
    		x: 0,
    		y: 14
    	},
    	{
    		clue: "Fairly",
    		answer: "PRETTY",
    		direction: "across",
    		x: 4,
    		y: 14
    	},
    	{
    		clue: "\"___ Eyes\" (1975 Eagles hit)",
    		answer: "LYIN",
    		direction: "across",
    		x: 11,
    		y: 14
    	},
    	{
    		clue: "Hindu title of respect",
    		answer: "BABU",
    		direction: "down",
    		x: 0,
    		y: 0
    	},
    	{
    		clue: "Expel",
    		answer: "EGEST",
    		direction: "down",
    		x: 1,
    		y: 0
    	},
    	{
    		clue: "Misspeaking, e.g.",
    		answer: "ERROR",
    		direction: "down",
    		x: 2,
    		y: 0
    	},
    	{
    		clue: "Some derivative stories, colloquially",
    		answer: "FANFIC",
    		direction: "down",
    		x: 3,
    		y: 0
    	},
    	{
    		clue: "Brew with hipster cred",
    		answer: "PBR",
    		direction: "down",
    		x: 5,
    		y: 0
    	},
    	{
    		clue: "American pop-rock band composed of three sisters",
    		answer: "HAIM",
    		direction: "down",
    		x: 6,
    		y: 0
    	},
    	{
    		clue: "Said \"I'll have ...\"",
    		answer: "ORDERED",
    		direction: "down",
    		x: 7,
    		y: 0
    	},
    	{
    		clue: "Cone-shaped corn snacks",
    		answer: "BUGLES",
    		direction: "down",
    		x: 8,
    		y: 0
    	},
    	{
    		clue: "Swelling reducer",
    		answer: "ICE",
    		direction: "down",
    		x: 9,
    		y: 0
    	},
    	{
    		clue: "Sounds of satisfaction",
    		answer: "AHS",
    		direction: "down",
    		x: 10,
    		y: 0
    	},
    	{
    		clue: "Broadcast often seen at 6:00 p.m. and 11:00 p.m.",
    		answer: "LOCALNEWS",
    		direction: "down",
    		x: 12,
    		y: 0
    	},
    	{
    		clue: "\"That is too much for me\"",
    		answer: "ICANTEVEN",
    		direction: "down",
    		x: 13,
    		y: 0
    	},
    	{
    		clue: "To be: Fr.",
    		answer: "ETRE",
    		direction: "down",
    		x: 14,
    		y: 0
    	},
    	{
    		clue: "Cake with rum",
    		answer: "BABA",
    		direction: "down",
    		x: 4,
    		y: 2
    	},
    	{
    		clue: "Battle of Normandy city",
    		answer: "CAEN",
    		direction: "down",
    		x: 11,
    		y: 3
    	},
    	{
    		clue: "Increase, as resolution",
    		answer: "ENHANCE",
    		direction: "down",
    		x: 5,
    		y: 4
    	},
    	{
    		clue: "Watches Bowser, say",
    		answer: "DOGSITS",
    		direction: "down",
    		x: 9,
    		y: 4
    	},
    	{
    		clue: "Dueling sword",
    		answer: "EPEE",
    		direction: "down",
    		x: 10,
    		y: 4
    	},
    	{
    		clue: "Catch",
    		answer: "NAB",
    		direction: "down",
    		x: 6,
    		y: 5
    	},
    	{
    		clue: "Skate park feature",
    		answer: "RAIL",
    		direction: "down",
    		x: 14,
    		y: 5
    	},
    	{
    		clue: "Many a May or June honoree",
    		answer: "GRAD",
    		direction: "down",
    		x: 0,
    		y: 6
    	},
    	{
    		clue: "Some fund-raisers",
    		answer: "TELETHONS",
    		direction: "down",
    		x: 1,
    		y: 6
    	},
    	{
    		clue: "1975 hit by the Electric Light Orchestra",
    		answer: "EVILWOMAN",
    		direction: "down",
    		x: 2,
    		y: 6
    	},
    	{
    		clue: "\"Just ___\" (Nike slogan)",
    		answer: "DOIT",
    		direction: "down",
    		x: 4,
    		y: 7
    	},
    	{
    		clue: "Very long time",
    		answer: "EON",
    		direction: "down",
    		x: 8,
    		y: 7
    	},
    	{
    		clue: "Union workplace",
    		answer: "SHOP",
    		direction: "down",
    		x: 3,
    		y: 8
    	},
    	{
    		clue: "Small citrus fruit",
    		answer: "KUMQUAT",
    		direction: "down",
    		x: 7,
    		y: 8
    	},
    	{
    		clue: "Baltimore athlete",
    		answer: "ORIOLE",
    		direction: "down",
    		x: 6,
    		y: 9
    	},
    	{
    		clue: "If-___ (computer programming statement)",
    		answer: "ELSE",
    		direction: "down",
    		x: 10,
    		y: 9
    	},
    	{
    		clue: "Wholesale's opposite",
    		answer: "RETAIL",
    		direction: "down",
    		x: 11,
    		y: 9
    	},
    	{
    		clue: "Like a bad apple",
    		answer: "WORMY",
    		direction: "down",
    		x: 12,
    		y: 10
    	},
    	{
    		clue: "2014 Winter Olympics locale",
    		answer: "SOCHI",
    		direction: "down",
    		x: 13,
    		y: 10
    	},
    	{
    		clue: "\"___ in the Morning\" (bygone radio show)",
    		answer: "IMUS",
    		direction: "down",
    		x: 0,
    		y: 11
    	},
    	{
    		clue: "Narrow opening",
    		answer: "SLIT",
    		direction: "down",
    		x: 8,
    		y: 11
    	},
    	{
    		clue: "Sound: Prefix",
    		answer: "PHON",
    		direction: "down",
    		x: 14,
    		y: 11
    	},
    	{
    		clue: "Gradually weaken",
    		answer: "SAP",
    		direction: "down",
    		x: 4,
    		y: 12
    	},
    	{
    		clue: "Home of most of the members of NATO: Abbr.",
    		answer: "EUR",
    		direction: "down",
    		x: 5,
    		y: 12
    	},
    	{
    		clue: "Total mess",
    		answer: "STY",
    		direction: "down",
    		x: 9,
    		y: 12
    	}
    ];

    var dataOreo = [
    	{
    		clue: "Black-and-white cookie",
    		answer: "OREO",
    		direction: "down",
    		x: 0,
    		y: 0
    	},
    	{
    		clue: "Popular cookie",
    		answer: "OREO",
    		direction: "down",
    		x: 3,
    		y: 0
    	},
    	{
    		clue: "Creme-filled cookie",
    		answer: "OREO",
    		direction: "across",
    		x: 0,
    		y: 3
    	},
    	{
    		clue: "Sandwich cookie",
    		answer: "OREO",
    		direction: "across",
    		x: 0,
    		y: 0
    	}
    ];

    var dataAmelia = [
    	{
    		clue: "A famous Wattenberger",
    		answer: "amelia",
    		direction: "down",
    		x: 0,
    		y: 0
    	},
    	{
    		clue: "Cheese monger of yore",
    		answer: "amelia",
    		direction: "down",
    		x: 5,
    		y: 0
    	},
    	{
    		clue: "Creator of the best crossword theme",
    		answer: "amelia",
    		direction: "across",
    		x: 0,
    		y: 5
    	},
    	{
    		clue: "OREO-lover",
    		answer: "amelia",
    		direction: "across",
    		x: 0,
    		y: 0
    	}
    ];

    var dataUSA = [
    	{
    		answer: "BARRYMORE",
    		clue: "\"Whip It\" director Drew",
    		direction: "across",
    		x: 0,
    		y: 0,
    		custom: "woman"
    	},
    	{
    		answer: "DAHL",
    		clue: "\"Journey to the Center of the Earth\" star Arlene",
    		direction: "across",
    		x: 9,
    		y: 1,
    		custom: "woman"
    	},
    	{
    		answer: "LETITIA",
    		clue: "\"Black Panther\" actress Wright",
    		direction: "across",
    		x: 0,
    		y: 2,
    		custom: "woman"
    	},
    	{
    		answer: "RIHANNA",
    		clue: "\"Disturbia\" singer",
    		direction: "across",
    		x: 6,
    		y: 3,
    		custom: "woman"
    	},
    	{
    		answer: "DIRK",
    		clue: "Dallas Mavericks great Nowitzki",
    		direction: "across",
    		x: 3,
    		y: 4,
    		custom: "man"
    	},
    	{
    		answer: "HANNAH",
    		clue: "Oscar winner Beachler",
    		direction: "across",
    		x: 6,
    		y: 5,
    		custom: "woman"
    	},
    	{
    		answer: "GEORGIA",
    		clue: "Painter with a museum in Santa Fe",
    		direction: "across",
    		x: 0,
    		y: 6,
    		custom: "woman"
    	},
    	{
    		answer: "LIZZO",
    		clue: "\"Cuz I Love You\" singer",
    		direction: "across",
    		x: 8,
    		y: 7,
    		custom: "woman"
    	},
    	{
    		answer: "LEVY",
    		clue: "TV star Dan",
    		direction: "across",
    		x: 3,
    		y: 8,
    		custom: "man"
    	},
    	{
    		answer: "RAE",
    		clue: "\"The Misadventures of Awkward Black Girl\" author Issa",
    		direction: "across",
    		x: 0,
    		y: 9,
    		custom: "woman"
    	},
    	{
    		answer: "ALBERT",
    		clue: "Slugger Pujols",
    		direction: "across",
    		x: 6,
    		y: 9,
    		custom: "man"
    	},
    	{
    		answer: "TRACE",
    		clue: "\"Hustlers\" actress Lysette",
    		direction: "across",
    		x: 0,
    		y: 11,
    		custom: "woman"
    	},
    	{
    		answer: "OHENRY",
    		clue: "\"The Gift of the Magi\" author",
    		direction: "across",
    		x: 5,
    		y: 12,
    		custom: "man"
    	},
    	{
    		answer: "BELLA",
    		clue: "Actress Thorne",
    		direction: "down",
    		x: 0,
    		y: 0,
    		custom: "woman"
    	},
    	{
    		answer: "RITA",
    		clue: "Acting legend Moreno",
    		direction: "down",
    		x: 2,
    		y: 0,
    		custom: "woman"
    	},
    	{
    		answer: "OMARKHAYYAM",
    		clue: "Persian poet, astronomer, mathematician",
    		direction: "down",
    		x: 6,
    		y: 0,
    		custom: "man"
    	},
    	{
    		answer: "ALIA",
    		clue: "\"Search Party\" star Shawkat",
    		direction: "down",
    		x: 12,
    		y: 0,
    		custom: "woman"
    	},
    	{
    		answer: "DUA",
    		clue: "\"New Rules\" singer Lipa",
    		direction: "down",
    		x: 9,
    		y: 1,
    		custom: "woman"
    	},
    	{
    		answer: "NIA",
    		clue: "\"In Too Deep\" actress Long",
    		direction: "down",
    		x: 10,
    		y: 3,
    		custom: "woman"
    	},
    	{
    		answer: "DARYL",
    		clue: "Actress ___ Hannah",
    		direction: "down",
    		x: 3,
    		y: 4,
    		custom: "woman"
    	},
    	{
    		answer: "LEBRON",
    		clue: "NBA star James",
    		direction: "down",
    		x: 8,
    		y: 7,
    		custom: "man"
    	},
    	{
    		answer: "GRETA",
    		clue: "Director Gerwig",
    		direction: "down",
    		x: 0,
    		y: 8,
    		custom: "woman"
    	},
    	{
    		answer: "ELLE",
    		clue: "\"Ex's & Oh's\" singer King",
    		direction: "down",
    		x: 4,
    		y: 8,
    		custom: "woman"
    	},
    	{
    		answer: "EVA",
    		clue: "Model Marcille",
    		direction: "down",
    		x: 2,
    		y: 9,
    		custom: "woman"
    	},
    	{
    		answer: "TAN",
    		clue: "Fashion expert France",
    		direction: "down",
    		x: 11,
    		y: 9,
    		custom: "man"
    	}
    ];

    /* App.svelte generated by Svelte v3.29.0 */
    const file$b = "App.svelte";

    // (91:6) <div         class="toolbar"         slot="toolbar"         let:onClear         let:onReveal         style="background: yellow; padding: 2em;">
    function create_toolbar_slot(ctx) {
    	let div;
    	let button0;
    	let t1;
    	let button1;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			button0 = element("button");
    			button0.textContent = "clear puzzle";
    			t1 = space();
    			button1 = element("button");
    			button1.textContent = "show answers";
    			add_location(button0, file$b, 96, 8, 2544);
    			add_location(button1, file$b, 97, 8, 2603);
    			attr_dev(div, "class", "toolbar");
    			attr_dev(div, "slot", "toolbar");
    			set_style(div, "background", "yellow");
    			set_style(div, "padding", "2em");
    			add_location(div, file$b, 90, 6, 2392);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, button0);
    			append_dev(div, t1);
    			append_dev(div, button1);

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						button0,
    						"click",
    						function () {
    							if (is_function(/*onClear*/ ctx[5])) /*onClear*/ ctx[5].apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button1,
    						"click",
    						function () {
    							if (is_function(/*onReveal*/ ctx[6])) /*onReveal*/ ctx[6].apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_toolbar_slot.name,
    		type: "slot",
    		source: "(91:6) <div         class=\\\"toolbar\\\"         slot=\\\"toolbar\\\"         let:onClear         let:onReveal         style=\\\"background: yellow; padding: 2em;\\\">",
    		ctx
    	});

    	return block;
    }

    // (100:6) <div slot="complete">
    function create_complete_slot(ctx) {
    	let div;
    	let h3;
    	let t1;
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			div = element("div");
    			h3 = element("h3");
    			h3.textContent = "OMG, congrats!";
    			t1 = space();
    			img = element("img");
    			add_location(h3, file$b, 100, 8, 2704);
    			attr_dev(img, "alt", "celebration");
    			if (img.src !== (img_src_value = "https://media3.giphy.com/media/QpOZPQQ2wbjOM/giphy.gif")) attr_dev(img, "src", img_src_value);
    			add_location(img, file$b, 101, 8, 2736);
    			attr_dev(div, "slot", "complete");
    			add_location(div, file$b, 99, 6, 2674);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, h3);
    			append_dev(div, t1);
    			append_dev(div, img);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_complete_slot.name,
    		type: "slot",
    		source: "(100:6) <div slot=\\\"complete\\\">",
    		ctx
    	});

    	return block;
    }

    // (90:4) <Crossword data="{dataNYTDaily}">
    function create_default_slot$1(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = space();
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(90:4) <Crossword data=\\\"{dataNYTDaily}\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$b(ctx) {
    	let article;
    	let div0;
    	let h1;
    	let t1;
    	let p0;
    	let t2;
    	let a0;
    	let t4;
    	let a1;
    	let t6;
    	let t7;
    	let section0;
    	let div1;
    	let h20;
    	let t9;
    	let p1;
    	let t10;
    	let a2;
    	let t12;
    	let t13;
    	let crossword0;
    	let t14;
    	let section1;
    	let div2;
    	let h21;
    	let t16;
    	let p2;
    	let t17;
    	let a3;
    	let t19;
    	let t20;
    	let crossword1;
    	let t21;
    	let section2;
    	let div3;
    	let h22;
    	let t23;
    	let p3;
    	let t25;
    	let select;
    	let option0;
    	let option1;
    	let option2;
    	let option3;
    	let t30;
    	let div4;
    	let crossword2;
    	let t31;
    	let section3;
    	let div5;
    	let h23;
    	let t33;
    	let p4;
    	let t35;
    	let crossword3;
    	let updating_revealed;
    	let t36;
    	let section4;
    	let div6;
    	let h24;
    	let t38;
    	let p5;
    	let t40;
    	let crossword4;
    	let current;
    	let mounted;
    	let dispose;

    	crossword0 = new Crossword({
    			props: { data: /*dataChange*/ ctx[2] },
    			$$inline: true
    		});

    	crossword1 = new Crossword({
    			props: { data: dataNYTMini },
    			$$inline: true
    		});

    	crossword2 = new Crossword({
    			props: {
    				data: dataOreo,
    				theme: /*theme*/ ctx[1],
    				showCompleteMessage: false
    			},
    			$$inline: true
    		});

    	function crossword3_revealed_binding(value) {
    		/*crossword3_revealed_binding*/ ctx[4].call(null, value);
    	}

    	let crossword3_props = {
    		data: dataUSA,
    		disableHighlight: /*revealedUSA*/ ctx[0]
    	};

    	if (/*revealedUSA*/ ctx[0] !== void 0) {
    		crossword3_props.revealed = /*revealedUSA*/ ctx[0];
    	}

    	crossword3 = new Crossword({ props: crossword3_props, $$inline: true });
    	binding_callbacks.push(() => bind(crossword3, "revealed", crossword3_revealed_binding));

    	crossword4 = new Crossword({
    			props: {
    				data: dataNYTDaily,
    				$$slots: {
    					default: [create_default_slot$1],
    					complete: [create_complete_slot],
    					toolbar: [
    						create_toolbar_slot,
    						({ onClear, onReveal }) => ({ 5: onClear, 6: onReveal }),
    						({ onClear, onReveal }) => (onClear ? 32 : 0) | (onReveal ? 64 : 0)
    					]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			article = element("article");
    			div0 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Svelte Crossword";
    			t1 = space();
    			p0 = element("p");
    			t2 = text("A crossword component for\n      ");
    			a0 = element("a");
    			a0.textContent = "Svelte";
    			t4 = text(". Read the docs on\n      ");
    			a1 = element("a");
    			a1.textContent = "Github";
    			t6 = text(".");
    			t7 = space();
    			section0 = element("section");
    			div1 = element("div");
    			h20 = element("h2");
    			h20.textContent = "Default";
    			t9 = space();
    			p1 = element("p");
    			t10 = text("A\n        ");
    			a2 = element("a");
    			a2.textContent = "NYT\n          daily";
    			t12 = text("\n        puzzle with all default settings.");
    			t13 = space();
    			create_component(crossword0.$$.fragment);
    			t14 = space();
    			section1 = element("section");
    			div2 = element("div");
    			h21 = element("h2");
    			h21.textContent = "Mobile";
    			t16 = space();
    			p2 = element("p");
    			t17 = text("A\n        ");
    			a3 = element("a");
    			a3.textContent = "NYT\n          mini";
    			t19 = text("\n        puzzle with all default settings and forced mobile view.");
    			t20 = space();
    			create_component(crossword1.$$.fragment);
    			t21 = space();
    			section2 = element("section");
    			div3 = element("div");
    			h22 = element("h2");
    			h22.textContent = "Themes";
    			t23 = space();
    			p3 = element("p");
    			p3.textContent = "A library of preset style themes to choose from.";
    			t25 = space();
    			select = element("select");
    			option0 = element("option");
    			option0.textContent = "Classic";
    			option1 = element("option");
    			option1.textContent = "Dark";
    			option2 = element("option");
    			option2.textContent = "Amelia";
    			option3 = element("option");
    			option3.textContent = "Citrus";
    			t30 = space();
    			div4 = element("div");
    			create_component(crossword2.$$.fragment);
    			t31 = space();
    			section3 = element("section");
    			div5 = element("div");
    			h23 = element("h2");
    			h23.textContent = "Simple Customization";
    			t33 = space();
    			p4 = element("p");
    			p4.textContent = "Custom class name on cells.";
    			t35 = space();
    			create_component(crossword3.$$.fragment);
    			t36 = space();
    			section4 = element("section");
    			div6 = element("div");
    			h24 = element("h2");
    			h24.textContent = "Advanced Customization";
    			t38 = space();
    			p5 = element("p");
    			p5.textContent = "TBD.";
    			t40 = space();
    			create_component(crossword4.$$.fragment);
    			attr_dev(h1, "class", "svelte-powwth");
    			add_location(h1, file$b, 19, 4, 470);
    			attr_dev(a0, "href", "https://svelte.dev");
    			add_location(a0, file$b, 22, 6, 542);
    			attr_dev(a1, "href", "https://github.com/russellgoldenberg/svelte-crossword#svelte-crossword");
    			add_location(a1, file$b, 23, 6, 606);
    			attr_dev(p0, "class", "svelte-powwth");
    			add_location(p0, file$b, 20, 4, 500);
    			attr_dev(div0, "class", "intro svelte-powwth");
    			add_location(div0, file$b, 18, 2, 446);
    			attr_dev(h20, "class", "svelte-powwth");
    			add_location(h20, file$b, 30, 6, 780);
    			attr_dev(a2, "href", "https://www.nytimes.com/crosswords/game/daily/2020/10/21");
    			add_location(a2, file$b, 33, 8, 825);
    			attr_dev(p1, "class", "svelte-powwth");
    			add_location(p1, file$b, 31, 6, 803);
    			attr_dev(div1, "class", "info svelte-powwth");
    			add_location(div1, file$b, 29, 4, 755);
    			attr_dev(section0, "id", "default");
    			attr_dev(section0, "class", "svelte-powwth");
    			add_location(section0, file$b, 28, 2, 728);
    			attr_dev(h21, "class", "svelte-powwth");
    			add_location(h21, file$b, 43, 6, 1109);
    			attr_dev(a3, "href", "https://www.nytimes.com/crosswords/game/mini/2020/10/21");
    			add_location(a3, file$b, 46, 8, 1153);
    			attr_dev(p2, "class", "svelte-powwth");
    			add_location(p2, file$b, 44, 6, 1131);
    			attr_dev(div2, "class", "info svelte-powwth");
    			add_location(div2, file$b, 42, 4, 1084);
    			attr_dev(section1, "id", "mini");
    			set_style(section1, "max-width", "480px");
    			attr_dev(section1, "class", "svelte-powwth");
    			add_location(section1, file$b, 41, 2, 1034);
    			attr_dev(h22, "class", "svelte-powwth");
    			add_location(h22, file$b, 56, 6, 1435);
    			attr_dev(p3, "class", "svelte-powwth");
    			add_location(p3, file$b, 57, 6, 1457);
    			option0.__value = "classic";
    			option0.value = option0.__value;
    			add_location(option0, file$b, 59, 8, 1557);
    			option1.__value = "dark";
    			option1.value = option1.__value;
    			add_location(option1, file$b, 60, 8, 1606);
    			option2.__value = "amelia";
    			option2.value = option2.__value;
    			add_location(option2, file$b, 61, 8, 1649);
    			option3.__value = "citrus";
    			option3.value = option3.__value;
    			add_location(option3, file$b, 62, 8, 1696);
    			if (/*theme*/ ctx[1] === void 0) add_render_callback(() => /*select_change_handler*/ ctx[3].call(select));
    			add_location(select, file$b, 58, 6, 1519);
    			attr_dev(div3, "class", "info svelte-powwth");
    			add_location(div3, file$b, 55, 4, 1410);
    			add_location(div4, file$b, 65, 4, 1766);
    			attr_dev(section2, "id", "themes");
    			attr_dev(section2, "class", "svelte-powwth");
    			add_location(section2, file$b, 54, 2, 1384);
    			attr_dev(h23, "class", "svelte-powwth");
    			add_location(h23, file$b, 75, 6, 2006);
    			attr_dev(p4, "class", "svelte-powwth");
    			add_location(p4, file$b, 76, 6, 2042);
    			attr_dev(div5, "class", "info svelte-powwth");
    			add_location(div5, file$b, 74, 4, 1981);
    			attr_dev(section3, "id", "simple-customization");
    			attr_dev(section3, "class", "svelte-powwth");
    			toggle_class(section3, "is-revealed", /*revealedUSA*/ ctx[0]);
    			add_location(section3, file$b, 73, 2, 1907);
    			attr_dev(h24, "class", "svelte-powwth");
    			add_location(h24, file$b, 86, 6, 2287);
    			attr_dev(p5, "class", "svelte-powwth");
    			add_location(p5, file$b, 87, 6, 2325);
    			attr_dev(div6, "class", "info svelte-powwth");
    			add_location(div6, file$b, 85, 4, 2262);
    			attr_dev(section4, "id", "advanced-customization");
    			attr_dev(section4, "class", "svelte-powwth");
    			add_location(section4, file$b, 84, 2, 2220);
    			attr_dev(article, "class", "svelte-powwth");
    			add_location(article, file$b, 17, 0, 434);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, article, anchor);
    			append_dev(article, div0);
    			append_dev(div0, h1);
    			append_dev(div0, t1);
    			append_dev(div0, p0);
    			append_dev(p0, t2);
    			append_dev(p0, a0);
    			append_dev(p0, t4);
    			append_dev(p0, a1);
    			append_dev(p0, t6);
    			append_dev(article, t7);
    			append_dev(article, section0);
    			append_dev(section0, div1);
    			append_dev(div1, h20);
    			append_dev(div1, t9);
    			append_dev(div1, p1);
    			append_dev(p1, t10);
    			append_dev(p1, a2);
    			append_dev(p1, t12);
    			append_dev(section0, t13);
    			mount_component(crossword0, section0, null);
    			append_dev(article, t14);
    			append_dev(article, section1);
    			append_dev(section1, div2);
    			append_dev(div2, h21);
    			append_dev(div2, t16);
    			append_dev(div2, p2);
    			append_dev(p2, t17);
    			append_dev(p2, a3);
    			append_dev(p2, t19);
    			append_dev(section1, t20);
    			mount_component(crossword1, section1, null);
    			append_dev(article, t21);
    			append_dev(article, section2);
    			append_dev(section2, div3);
    			append_dev(div3, h22);
    			append_dev(div3, t23);
    			append_dev(div3, p3);
    			append_dev(div3, t25);
    			append_dev(div3, select);
    			append_dev(select, option0);
    			append_dev(select, option1);
    			append_dev(select, option2);
    			append_dev(select, option3);
    			select_option(select, /*theme*/ ctx[1]);
    			append_dev(section2, t30);
    			append_dev(section2, div4);
    			mount_component(crossword2, div4, null);
    			append_dev(article, t31);
    			append_dev(article, section3);
    			append_dev(section3, div5);
    			append_dev(div5, h23);
    			append_dev(div5, t33);
    			append_dev(div5, p4);
    			append_dev(section3, t35);
    			mount_component(crossword3, section3, null);
    			append_dev(article, t36);
    			append_dev(article, section4);
    			append_dev(section4, div6);
    			append_dev(div6, h24);
    			append_dev(div6, t38);
    			append_dev(div6, p5);
    			append_dev(section4, t40);
    			mount_component(crossword4, section4, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(select, "change", /*select_change_handler*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			const crossword0_changes = {};
    			if (dirty & /*dataChange*/ 4) crossword0_changes.data = /*dataChange*/ ctx[2];
    			crossword0.$set(crossword0_changes);

    			if (dirty & /*theme*/ 2) {
    				select_option(select, /*theme*/ ctx[1]);
    			}

    			const crossword2_changes = {};
    			if (dirty & /*theme*/ 2) crossword2_changes.theme = /*theme*/ ctx[1];
    			crossword2.$set(crossword2_changes);
    			const crossword3_changes = {};
    			if (dirty & /*revealedUSA*/ 1) crossword3_changes.disableHighlight = /*revealedUSA*/ ctx[0];

    			if (!updating_revealed && dirty & /*revealedUSA*/ 1) {
    				updating_revealed = true;
    				crossword3_changes.revealed = /*revealedUSA*/ ctx[0];
    				add_flush_callback(() => updating_revealed = false);
    			}

    			crossword3.$set(crossword3_changes);

    			if (dirty & /*revealedUSA*/ 1) {
    				toggle_class(section3, "is-revealed", /*revealedUSA*/ ctx[0]);
    			}

    			const crossword4_changes = {};

    			if (dirty & /*$$scope, onReveal, onClear*/ 224) {
    				crossword4_changes.$$scope = { dirty, ctx };
    			}

    			crossword4.$set(crossword4_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(crossword0.$$.fragment, local);
    			transition_in(crossword1.$$.fragment, local);
    			transition_in(crossword2.$$.fragment, local);
    			transition_in(crossword3.$$.fragment, local);
    			transition_in(crossword4.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(crossword0.$$.fragment, local);
    			transition_out(crossword1.$$.fragment, local);
    			transition_out(crossword2.$$.fragment, local);
    			transition_out(crossword3.$$.fragment, local);
    			transition_out(crossword4.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(article);
    			destroy_component(crossword0);
    			destroy_component(crossword1);
    			destroy_component(crossword2);
    			destroy_component(crossword3);
    			destroy_component(crossword4);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);
    	let revealedUSA;
    	let theme;
    	let dataChange = dataNYTDaily;

    	setTimeout(
    		() => {
    			$$invalidate(2, dataChange = dataNYTMini);
    		},
    		3000
    	);

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function select_change_handler() {
    		theme = select_value(this);
    		$$invalidate(1, theme);
    	}

    	function crossword3_revealed_binding(value) {
    		revealedUSA = value;
    		$$invalidate(0, revealedUSA);
    	}

    	$$self.$capture_state = () => ({
    		Crossword,
    		dataNYTMini,
    		dataNYTDaily,
    		dataOreo,
    		dataAmelia,
    		dataUSA,
    		revealedUSA,
    		theme,
    		dataChange
    	});

    	$$self.$inject_state = $$props => {
    		if ("revealedUSA" in $$props) $$invalidate(0, revealedUSA = $$props.revealedUSA);
    		if ("theme" in $$props) $$invalidate(1, theme = $$props.theme);
    		if ("dataChange" in $$props) $$invalidate(2, dataChange = $$props.dataChange);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		revealedUSA,
    		theme,
    		dataChange,
    		select_change_handler,
    		crossword3_revealed_binding
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$b.name
    		});
    	}
    }

    const app = new App({
    	target: document.querySelector("main")
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map