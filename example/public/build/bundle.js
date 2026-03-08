var app = (function () {
	'use strict';

	/** @returns {void} */
	function noop() {}

	const identity = (x) => x;

	/**
	 * @template T
	 * @template S
	 * @param {T} tar
	 * @param {S} src
	 * @returns {T & S}
	 */
	function assign(tar, src) {
		// @ts-ignore
		for (const k in src) tar[k] = src[k];
		return /** @type {T & S} */ (tar);
	}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	/**
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function run_all(fns) {
		fns.forEach(run);
	}

	/**
	 * @param {any} thing
	 * @returns {thing is Function}
	 */
	function is_function(thing) {
		return typeof thing === 'function';
	}

	/** @returns {boolean} */
	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
	}

	/** @returns {boolean} */
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
		return definition[1] && fn ? assign($$scope.ctx.slice(), definition[1](fn(ctx))) : $$scope.ctx;
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

	/** @returns {void} */
	function update_slot_base(
		slot,
		slot_definition,
		ctx,
		$$scope,
		slot_changes,
		get_slot_context_fn
	) {
		if (slot_changes) {
			const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
			slot.p(slot_context, slot_changes);
		}
	}

	/** @returns {any[] | -1} */
	function get_all_dirty_from_scope($$scope) {
		if ($$scope.ctx.length > 32) {
			const dirty = [];
			const length = $$scope.ctx.length / 32;
			for (let i = 0; i < length; i++) {
				dirty[i] = -1;
			}
			return dirty;
		}
		return -1;
	}

	function null_to_empty(value) {
		return value == null ? '' : value;
	}

	function action_destroyer(action_result) {
		return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
	}

	const is_client = typeof window !== 'undefined';

	/** @type {() => number} */
	let now = is_client ? () => window.performance.now() : () => Date.now();

	let raf = is_client ? (cb) => requestAnimationFrame(cb) : noop;

	const tasks = new Set();

	/**
	 * @param {number} now
	 * @returns {void}
	 */
	function run_tasks(now) {
		tasks.forEach((task) => {
			if (!task.c(now)) {
				tasks.delete(task);
				task.f();
			}
		});
		if (tasks.size !== 0) raf(run_tasks);
	}

	/**
	 * Creates a new task that runs on each raf frame
	 * until it returns a falsy value or is aborted
	 * @param {import('./private.js').TaskCallback} callback
	 * @returns {import('./private.js').Task}
	 */
	function loop(callback) {
		/** @type {import('./private.js').TaskEntry} */
		let task;
		if (tasks.size === 0) raf(run_tasks);
		return {
			promise: new Promise((fulfill) => {
				tasks.add((task = { c: callback, f: fulfill }));
			}),
			abort() {
				tasks.delete(task);
			}
		};
	}

	// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
	// at the end of hydration without touching the remaining nodes.
	let is_hydrating = false;

	/**
	 * @returns {void}
	 */
	function start_hydrating() {
		is_hydrating = true;
	}

	/**
	 * @returns {void}
	 */
	function end_hydrating() {
		is_hydrating = false;
	}

	/**
	 * @param {number} low
	 * @param {number} high
	 * @param {(index: number) => number} key
	 * @param {number} value
	 * @returns {number}
	 */
	function upper_bound(low, high, key, value) {
		// Return first index of value larger than input value in the range [low, high)
		while (low < high) {
			const mid = low + ((high - low) >> 1);
			if (key(mid) <= value) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return low;
	}

	/**
	 * @param {NodeEx} target
	 * @returns {void}
	 */
	function init_hydrate(target) {
		if (target.hydrate_init) return;
		target.hydrate_init = true;
		// We know that all children have claim_order values since the unclaimed have been detached if target is not <head>

		let children = /** @type {ArrayLike<NodeEx2>} */ (target.childNodes);
		// If target is <head>, there may be children without claim_order
		if (target.nodeName === 'HEAD') {
			const my_children = [];
			for (let i = 0; i < children.length; i++) {
				const node = children[i];
				if (node.claim_order !== undefined) {
					my_children.push(node);
				}
			}
			children = my_children;
		}
		/*
		 * Reorder claimed children optimally.
		 * We can reorder claimed children optimally by finding the longest subsequence of
		 * nodes that are already claimed in order and only moving the rest. The longest
		 * subsequence of nodes that are claimed in order can be found by
		 * computing the longest increasing subsequence of .claim_order values.
		 *
		 * This algorithm is optimal in generating the least amount of reorder operations
		 * possible.
		 *
		 * Proof:
		 * We know that, given a set of reordering operations, the nodes that do not move
		 * always form an increasing subsequence, since they do not move among each other
		 * meaning that they must be already ordered among each other. Thus, the maximal
		 * set of nodes that do not move form a longest increasing subsequence.
		 */
		// Compute longest increasing subsequence
		// m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
		const m = new Int32Array(children.length + 1);
		// Predecessor indices + 1
		const p = new Int32Array(children.length);
		m[0] = -1;
		let longest = 0;
		for (let i = 0; i < children.length; i++) {
			const current = children[i].claim_order;
			// Find the largest subsequence length such that it ends in a value less than our current value
			// upper_bound returns first greater value, so we subtract one
			// with fast path for when we are on the current longest subsequence
			const seq_len =
				(longest > 0 && children[m[longest]].claim_order <= current
					? longest + 1
					: upper_bound(1, longest, (idx) => children[m[idx]].claim_order, current)) - 1;
			p[i] = m[seq_len] + 1;
			const new_len = seq_len + 1;
			// We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
			m[new_len] = i;
			longest = Math.max(new_len, longest);
		}
		// The longest increasing subsequence of nodes (initially reversed)

		/**
		 * @type {NodeEx2[]}
		 */
		const lis = [];
		// The rest of the nodes, nodes that will be moved

		/**
		 * @type {NodeEx2[]}
		 */
		const to_move = [];
		let last = children.length - 1;
		for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
			lis.push(children[cur - 1]);
			for (; last >= cur; last--) {
				to_move.push(children[last]);
			}
			last--;
		}
		for (; last >= 0; last--) {
			to_move.push(children[last]);
		}
		lis.reverse();
		// We sort the nodes being moved to guarantee that their insertion order matches the claim order
		to_move.sort((a, b) => a.claim_order - b.claim_order);
		// Finally, we move the nodes
		for (let i = 0, j = 0; i < to_move.length; i++) {
			while (j < lis.length && to_move[i].claim_order >= lis[j].claim_order) {
				j++;
			}
			const anchor = j < lis.length ? lis[j] : null;
			target.insertBefore(to_move[i], anchor);
		}
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @returns {void}
	 */
	function append(target, node) {
		target.appendChild(node);
	}

	/**
	 * @param {Node} node
	 * @returns {ShadowRoot | Document}
	 */
	function get_root_for_style(node) {
		if (!node) return document;
		const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
		if (root && /** @type {ShadowRoot} */ (root).host) {
			return /** @type {ShadowRoot} */ (root);
		}
		return node.ownerDocument;
	}

	/**
	 * @param {Node} node
	 * @returns {CSSStyleSheet}
	 */
	function append_empty_stylesheet(node) {
		const style_element = element('style');
		// For transitions to work without 'style-src: unsafe-inline' Content Security Policy,
		// these empty tags need to be allowed with a hash as a workaround until we move to the Web Animations API.
		// Using the hash for the empty string (for an empty tag) works in all browsers except Safari.
		// So as a workaround for the workaround, when we append empty style tags we set their content to /* empty */.
		// The hash 'sha256-9OlNO0DNEeaVzHL4RZwCLsBHA8WBQ8toBp/4F5XV2nc=' will then work even in Safari.
		style_element.textContent = '/* empty */';
		append_stylesheet(get_root_for_style(node), style_element);
		return style_element.sheet;
	}

	/**
	 * @param {ShadowRoot | Document} node
	 * @param {HTMLStyleElement} style
	 * @returns {CSSStyleSheet}
	 */
	function append_stylesheet(node, style) {
		append(/** @type {Document} */ (node).head || node, style);
		return style.sheet;
	}

	/**
	 * @param {NodeEx} target
	 * @param {NodeEx} node
	 * @returns {void}
	 */
	function append_hydration(target, node) {
		if (is_hydrating) {
			init_hydrate(target);
			if (
				target.actual_end_child === undefined ||
				(target.actual_end_child !== null && target.actual_end_child.parentNode !== target)
			) {
				target.actual_end_child = target.firstChild;
			}
			// Skip nodes of undefined ordering
			while (target.actual_end_child !== null && target.actual_end_child.claim_order === undefined) {
				target.actual_end_child = target.actual_end_child.nextSibling;
			}
			if (node !== target.actual_end_child) {
				// We only insert if the ordering of this node should be modified or the parent node is not target
				if (node.claim_order !== undefined || node.parentNode !== target) {
					target.insertBefore(node, target.actual_end_child);
				}
			} else {
				target.actual_end_child = node.nextSibling;
			}
		} else if (node.parentNode !== target || node.nextSibling !== null) {
			target.appendChild(node);
		}
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @param {Node} [anchor]
	 * @returns {void}
	 */
	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	/**
	 * @param {NodeEx} target
	 * @param {NodeEx} node
	 * @param {NodeEx} [anchor]
	 * @returns {void}
	 */
	function insert_hydration(target, node, anchor) {
		if (is_hydrating && !anchor) {
			append_hydration(target, node);
		} else if (node.parentNode !== target || node.nextSibling != anchor) {
			target.insertBefore(node, anchor || null);
		}
	}

	/**
	 * @param {Node} node
	 * @returns {void}
	 */
	function detach(node) {
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		}
	}

	/**
	 * @returns {void} */
	function destroy_each(iterations, detaching) {
		for (let i = 0; i < iterations.length; i += 1) {
			if (iterations[i]) iterations[i].d(detaching);
		}
	}

	/**
	 * @template {keyof HTMLElementTagNameMap} K
	 * @param {K} name
	 * @returns {HTMLElementTagNameMap[K]}
	 */
	function element(name) {
		return document.createElement(name);
	}

	/**
	 * @template {keyof SVGElementTagNameMap} K
	 * @param {K} name
	 * @returns {SVGElement}
	 */
	function svg_element(name) {
		return document.createElementNS('http://www.w3.org/2000/svg', name);
	}

	/**
	 * @param {string} data
	 * @returns {Text}
	 */
	function text(data) {
		return document.createTextNode(data);
	}

	/**
	 * @returns {Text} */
	function space() {
		return text(' ');
	}

	/**
	 * @returns {Text} */
	function empty() {
		return text('');
	}

	/**
	 * @param {EventTarget} node
	 * @param {string} event
	 * @param {EventListenerOrEventListenerObject} handler
	 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
	 * @returns {() => void}
	 */
	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	/**
	 * @param {Element} node
	 * @param {string} attribute
	 * @param {string} [value]
	 * @returns {void}
	 */
	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
	}

	/**
	 * @param {HTMLElement} node
	 * @returns {string}
	 */
	function get_svelte_dataset(node) {
		return node.dataset.svelteH;
	}

	/**
	 * @param {Element} element
	 * @returns {ChildNode[]}
	 */
	function children(element) {
		return Array.from(element.childNodes);
	}

	/**
	 * @param {ChildNodeArray} nodes
	 * @returns {void}
	 */
	function init_claim_info(nodes) {
		if (nodes.claim_info === undefined) {
			nodes.claim_info = { last_index: 0, total_claimed: 0 };
		}
	}

	/**
	 * @template {ChildNodeEx} R
	 * @param {ChildNodeArray} nodes
	 * @param {(node: ChildNodeEx) => node is R} predicate
	 * @param {(node: ChildNodeEx) => ChildNodeEx | undefined} process_node
	 * @param {() => R} create_node
	 * @param {boolean} dont_update_last_index
	 * @returns {R}
	 */
	function claim_node(nodes, predicate, process_node, create_node, dont_update_last_index = false) {
		// Try to find nodes in an order such that we lengthen the longest increasing subsequence
		init_claim_info(nodes);
		const result_node = (() => {
			// We first try to find an element after the previous one
			for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
				const node = nodes[i];
				if (predicate(node)) {
					const replacement = process_node(node);
					if (replacement === undefined) {
						nodes.splice(i, 1);
					} else {
						nodes[i] = replacement;
					}
					if (!dont_update_last_index) {
						nodes.claim_info.last_index = i;
					}
					return node;
				}
			}
			// Otherwise, we try to find one before
			// We iterate in reverse so that we don't go too far back
			for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
				const node = nodes[i];
				if (predicate(node)) {
					const replacement = process_node(node);
					if (replacement === undefined) {
						nodes.splice(i, 1);
					} else {
						nodes[i] = replacement;
					}
					if (!dont_update_last_index) {
						nodes.claim_info.last_index = i;
					} else if (replacement === undefined) {
						// Since we spliced before the last_index, we decrease it
						nodes.claim_info.last_index--;
					}
					return node;
				}
			}
			// If we can't find any matching node, we create a new one
			return create_node();
		})();
		result_node.claim_order = nodes.claim_info.total_claimed;
		nodes.claim_info.total_claimed += 1;
		return result_node;
	}

	/**
	 * @param {ChildNodeArray} nodes
	 * @param {string} name
	 * @param {{ [key: string]: boolean }} attributes
	 * @param {(name: string) => Element | SVGElement} create_element
	 * @returns {Element | SVGElement}
	 */
	function claim_element_base(nodes, name, attributes, create_element) {
		return claim_node(
			nodes,
			/** @returns {node is Element | SVGElement} */
			(node) => node.nodeName === name,
			/** @param {Element} node */
			(node) => {
				const remove = [];
				for (let j = 0; j < node.attributes.length; j++) {
					const attribute = node.attributes[j];
					if (!attributes[attribute.name]) {
						remove.push(attribute.name);
					}
				}
				remove.forEach((v) => node.removeAttribute(v));
				return undefined;
			},
			() => create_element(name)
		);
	}

	/**
	 * @param {ChildNodeArray} nodes
	 * @param {string} name
	 * @param {{ [key: string]: boolean }} attributes
	 * @returns {Element | SVGElement}
	 */
	function claim_element(nodes, name, attributes) {
		return claim_element_base(nodes, name, attributes, element);
	}

	/**
	 * @param {ChildNodeArray} nodes
	 * @param {string} name
	 * @param {{ [key: string]: boolean }} attributes
	 * @returns {Element | SVGElement}
	 */
	function claim_svg_element(nodes, name, attributes) {
		return claim_element_base(nodes, name, attributes, svg_element);
	}

	/**
	 * @param {ChildNodeArray} nodes
	 * @returns {Text}
	 */
	function claim_text(nodes, data) {
		return claim_node(
			nodes,
			/** @returns {node is Text} */
			(node) => node.nodeType === 3,
			/** @param {Text} node */
			(node) => {
				const data_str = '' + data;
				if (node.data.startsWith(data_str)) {
					if (node.data.length !== data_str.length) {
						return node.splitText(data_str.length);
					}
				} else {
					node.data = data_str;
				}
			},
			() => text(data),
			true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
		);
	}

	/**
	 * @returns {Text} */
	function claim_space(nodes) {
		return claim_text(nodes, ' ');
	}

	function get_comment_idx(nodes, text, start) {
		for (let i = start; i < nodes.length; i += 1) {
			const node = nodes[i];
			if (node.nodeType === 8 /* comment node */ && node.textContent.trim() === text) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * @param {boolean} is_svg
	 * @returns {HtmlTagHydration}
	 */
	function claim_html_tag(nodes, is_svg) {
		// find html opening tag
		const start_index = get_comment_idx(nodes, 'HTML_TAG_START', 0);
		const end_index = get_comment_idx(nodes, 'HTML_TAG_END', start_index + 1);
		if (start_index === -1 || end_index === -1) {
			return new HtmlTagHydration(is_svg);
		}

		init_claim_info(nodes);
		const html_tag_nodes = nodes.splice(start_index, end_index - start_index + 1);
		detach(html_tag_nodes[0]);
		detach(html_tag_nodes[html_tag_nodes.length - 1]);
		const claimed_nodes = html_tag_nodes.slice(1, html_tag_nodes.length - 1);
		if (claimed_nodes.length === 0) {
			return new HtmlTagHydration(is_svg);
		}
		for (const n of claimed_nodes) {
			n.claim_order = nodes.claim_info.total_claimed;
			nodes.claim_info.total_claimed += 1;
		}
		return new HtmlTagHydration(is_svg, claimed_nodes);
	}

	/**
	 * @param {Text} text
	 * @param {unknown} data
	 * @returns {void}
	 */
	function set_data(text, data) {
		data = '' + data;
		if (text.data === data) return;
		text.data = /** @type {string} */ (data);
	}

	/**
	 * @returns {void} */
	function set_input_value(input, value) {
		input.value = value == null ? '' : value;
	}

	/**
	 * @returns {void} */
	function set_style(node, key, value, important) {
		if (value == null) {
			node.style.removeProperty(key);
		} else {
			node.style.setProperty(key, value, important ? 'important' : '');
		}
	}

	/**
	 * @returns {void} */
	function select_option(select, value, mounting) {
		for (let i = 0; i < select.options.length; i += 1) {
			const option = select.options[i];
			if (option.__value === value) {
				option.selected = true;
				return;
			}
		}
		if (!mounting || value !== undefined) {
			select.selectedIndex = -1; // no option should be selected
		}
	}

	function select_value(select) {
		const selected_option = select.querySelector(':checked');
		return selected_option && selected_option.__value;
	}
	// unfortunately this can't be a constant as that wouldn't be tree-shakeable
	// so we cache the result instead

	/**
	 * @type {boolean} */
	let crossorigin;

	/**
	 * @returns {boolean} */
	function is_crossorigin() {
		if (crossorigin === undefined) {
			crossorigin = false;
			try {
				if (typeof window !== 'undefined' && window.parent) {
					void window.parent.document;
				}
			} catch (error) {
				crossorigin = true;
			}
		}
		return crossorigin;
	}

	/**
	 * @param {HTMLElement} node
	 * @param {() => void} fn
	 * @returns {() => void}
	 */
	function add_iframe_resize_listener(node, fn) {
		const computed_style = getComputedStyle(node);
		if (computed_style.position === 'static') {
			node.style.position = 'relative';
		}
		const iframe = element('iframe');
		iframe.setAttribute(
			'style',
			'display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ' +
				'overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: -1;'
		);
		iframe.setAttribute('aria-hidden', 'true');
		iframe.tabIndex = -1;
		const crossorigin = is_crossorigin();

		/**
		 * @type {() => void}
		 */
		let unsubscribe;
		if (crossorigin) {
			iframe.src = "data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>";
			unsubscribe = listen(
				window,
				'message',
				/** @param {MessageEvent} event */ (event) => {
					if (event.source === iframe.contentWindow) fn();
				}
			);
		} else {
			iframe.src = 'about:blank';
			iframe.onload = () => {
				unsubscribe = listen(iframe.contentWindow, 'resize', fn);
				// make sure an initial resize event is fired _after_ the iframe is loaded (which is asynchronous)
				// see https://github.com/sveltejs/svelte/issues/4233
				fn();
			};
		}
		append(node, iframe);
		return () => {
			if (crossorigin) {
				unsubscribe();
			} else if (unsubscribe && iframe.contentWindow) {
				unsubscribe();
			}
			detach(iframe);
		};
	}

	/**
	 * @returns {void} */
	function toggle_class(element, name, toggle) {
		// The `!!` is required because an `undefined` flag means flipping the current state.
		element.classList.toggle(name, !!toggle);
	}

	/**
	 * @template T
	 * @param {string} type
	 * @param {T} [detail]
	 * @param {{ bubbles?: boolean, cancelable?: boolean }} [options]
	 * @returns {CustomEvent<T>}
	 */
	function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
		return new CustomEvent(type, { detail, bubbles, cancelable });
	}
	/** */
	class HtmlTag {
		/**
		 * @private
		 * @default false
		 */
		is_svg = false;
		/** parent for creating node */
		e = undefined;
		/** html tag nodes */
		n = undefined;
		/** target */
		t = undefined;
		/** anchor */
		a = undefined;
		constructor(is_svg = false) {
			this.is_svg = is_svg;
			this.e = this.n = null;
		}

		/**
		 * @param {string} html
		 * @returns {void}
		 */
		c(html) {
			this.h(html);
		}

		/**
		 * @param {string} html
		 * @param {HTMLElement | SVGElement} target
		 * @param {HTMLElement | SVGElement} anchor
		 * @returns {void}
		 */
		m(html, target, anchor = null) {
			if (!this.e) {
				if (this.is_svg)
					this.e = svg_element(/** @type {keyof SVGElementTagNameMap} */ (target.nodeName));
				/** #7364  target for <template> may be provided as #document-fragment(11) */ else
					this.e = element(
						/** @type {keyof HTMLElementTagNameMap} */ (
							target.nodeType === 11 ? 'TEMPLATE' : target.nodeName
						)
					);
				this.t =
					target.tagName !== 'TEMPLATE'
						? target
						: /** @type {HTMLTemplateElement} */ (target).content;
				this.c(html);
			}
			this.i(anchor);
		}

		/**
		 * @param {string} html
		 * @returns {void}
		 */
		h(html) {
			this.e.innerHTML = html;
			this.n = Array.from(
				this.e.nodeName === 'TEMPLATE' ? this.e.content.childNodes : this.e.childNodes
			);
		}

		/**
		 * @returns {void} */
		i(anchor) {
			for (let i = 0; i < this.n.length; i += 1) {
				insert(this.t, this.n[i], anchor);
			}
		}

		/**
		 * @param {string} html
		 * @returns {void}
		 */
		p(html) {
			this.d();
			this.h(html);
			this.i(this.a);
		}

		/**
		 * @returns {void} */
		d() {
			this.n.forEach(detach);
		}
	}

	class HtmlTagHydration extends HtmlTag {
		/** @type {Element[]} hydration claimed nodes */
		l = undefined;

		constructor(is_svg = false, claimed_nodes) {
			super(is_svg);
			this.e = this.n = null;
			this.l = claimed_nodes;
		}

		/**
		 * @param {string} html
		 * @returns {void}
		 */
		c(html) {
			if (this.l) {
				this.n = this.l;
			} else {
				super.c(html);
			}
		}

		/**
		 * @returns {void} */
		i(anchor) {
			for (let i = 0; i < this.n.length; i += 1) {
				insert_hydration(this.t, this.n[i], anchor);
			}
		}
	}

	/**
	 * @typedef {Node & {
	 * 	claim_order?: number;
	 * 	hydrate_init?: true;
	 * 	actual_end_child?: NodeEx;
	 * 	childNodes: NodeListOf<NodeEx>;
	 * }} NodeEx
	 */

	/** @typedef {ChildNode & NodeEx} ChildNodeEx */

	/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

	/**
	 * @typedef {ChildNodeEx[] & {
	 * 	claim_info?: {
	 * 		last_index: number;
	 * 		total_claimed: number;
	 * 	};
	 * }} ChildNodeArray
	 */

	// we need to store the information for multiple documents because a Svelte application could also contain iframes
	// https://github.com/sveltejs/svelte/issues/3624
	/** @type {Map<Document | ShadowRoot, import('./private.d.ts').StyleInformation>} */
	const managed_styles = new Map();

	let active = 0;

	// https://github.com/darkskyapp/string-hash/blob/master/index.js
	/**
	 * @param {string} str
	 * @returns {number}
	 */
	function hash(str) {
		let hash = 5381;
		let i = str.length;
		while (i--) hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
		return hash >>> 0;
	}

	/**
	 * @param {Document | ShadowRoot} doc
	 * @param {Element & ElementCSSInlineStyle} node
	 * @returns {{ stylesheet: any; rules: {}; }}
	 */
	function create_style_information(doc, node) {
		const info = { stylesheet: append_empty_stylesheet(node), rules: {} };
		managed_styles.set(doc, info);
		return info;
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {number} a
	 * @param {number} b
	 * @param {number} duration
	 * @param {number} delay
	 * @param {(t: number) => number} ease
	 * @param {(t: number, u: number) => string} fn
	 * @param {number} uid
	 * @returns {string}
	 */
	function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
		const step = 16.666 / duration;
		let keyframes = '{\n';
		for (let p = 0; p <= 1; p += step) {
			const t = a + (b - a) * ease(p);
			keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
		}
		const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
		const name = `__svelte_${hash(rule)}_${uid}`;
		const doc = get_root_for_style(node);
		const { stylesheet, rules } = managed_styles.get(doc) || create_style_information(doc, node);
		if (!rules[name]) {
			rules[name] = true;
			stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
		}
		const animation = node.style.animation || '';
		node.style.animation = `${
		animation ? `${animation}, ` : ''
	}${name} ${duration}ms linear ${delay}ms 1 both`;
		active += 1;
		return name;
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {string} [name]
	 * @returns {void}
	 */
	function delete_rule(node, name) {
		const previous = (node.style.animation || '').split(', ');
		const next = previous.filter(
			name
				? (anim) => anim.indexOf(name) < 0 // remove specific animation
				: (anim) => anim.indexOf('__svelte') === -1 // remove all Svelte animations
		);
		const deleted = previous.length - next.length;
		if (deleted) {
			node.style.animation = next.join(', ');
			active -= deleted;
			if (!active) clear_rules();
		}
	}

	/** @returns {void} */
	function clear_rules() {
		raf(() => {
			if (active) return;
			managed_styles.forEach((info) => {
				const { ownerNode } = info.stylesheet;
				// there is no ownerNode if it runs on jsdom.
				if (ownerNode) detach(ownerNode);
			});
			managed_styles.clear();
		});
	}

	let current_component;

	/** @returns {void} */
	function set_current_component(component) {
		current_component = component;
	}

	function get_current_component() {
		if (!current_component) throw new Error('Function called outside component initialization');
		return current_component;
	}

	/**
	 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
	 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
	 * it can be called from an external module).
	 *
	 * If a function is returned _synchronously_ from `onMount`, it will be called when the component is unmounted.
	 *
	 * `onMount` does not run inside a [server-side component](https://svelte.dev/docs#run-time-server-side-component-api).
	 *
	 * https://svelte.dev/docs/svelte#onmount
	 * @template T
	 * @param {() => import('./private.js').NotFunction<T> | Promise<import('./private.js').NotFunction<T>> | (() => any)} fn
	 * @returns {void}
	 */
	function onMount(fn) {
		get_current_component().$$.on_mount.push(fn);
	}

	/**
	 * Creates an event dispatcher that can be used to dispatch [component events](https://svelte.dev/docs#template-syntax-component-directives-on-eventname).
	 * Event dispatchers are functions that can take two arguments: `name` and `detail`.
	 *
	 * Component events created with `createEventDispatcher` create a
	 * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
	 * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
	 * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
	 * property and can contain any type of data.
	 *
	 * The event dispatcher can be typed to narrow the allowed event names and the type of the `detail` argument:
	 * ```ts
	 * const dispatch = createEventDispatcher<{
	 *  loaded: never; // does not take a detail argument
	 *  change: string; // takes a detail argument of type string, which is required
	 *  optional: number | null; // takes an optional detail argument of type number
	 * }>();
	 * ```
	 *
	 * https://svelte.dev/docs/svelte#createeventdispatcher
	 * @template {Record<string, any>} [EventMap=any]
	 * @returns {import('./public.js').EventDispatcher<EventMap>}
	 */
	function createEventDispatcher() {
		const component = get_current_component();
		return (type, detail, { cancelable = false } = {}) => {
			const callbacks = component.$$.callbacks[type];
			if (callbacks) {
				// TODO are there situations where events could be dispatched
				// in a server (non-DOM) environment?
				const event = custom_event(/** @type {string} */ (type), detail, { cancelable });
				callbacks.slice().forEach((fn) => {
					fn.call(component, event);
				});
				return !event.defaultPrevented;
			}
			return true;
		};
	}

	const dirty_components = [];
	const binding_callbacks = [];

	let render_callbacks = [];

	const flush_callbacks = [];

	const resolved_promise = /* @__PURE__ */ Promise.resolve();

	let update_scheduled = false;

	/** @returns {void} */
	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	/** @returns {void} */
	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	/** @returns {void} */
	function add_flush_callback(fn) {
		flush_callbacks.push(fn);
	}

	// flush() calls callbacks in this order:
	// 1. All beforeUpdate callbacks, in order: parents before children
	// 2. All bind:this callbacks, in reverse order: children before parents.
	// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
	//    for afterUpdates called during the initial onMount, which are called in
	//    reverse order: children before parents.
	// Since callbacks might update component values, which could trigger another
	// call to flush(), the following steps guard against this:
	// 1. During beforeUpdate, any updated components will be added to the
	//    dirty_components array and will cause a reentrant call to flush(). Because
	//    the flush index is kept outside the function, the reentrant call will pick
	//    up where the earlier call left off and go through all dirty components. The
	//    current_component value is saved and restored so that the reentrant call will
	//    not interfere with the "parent" flush() call.
	// 2. bind:this callbacks cannot trigger new flush() calls.
	// 3. During afterUpdate, any updated components will NOT have their afterUpdate
	//    callback called a second time; the seen_callbacks set, outside the flush()
	//    function, guarantees this behavior.
	const seen_callbacks = new Set();

	let flushidx = 0; // Do *not* move this inside the flush() function

	/** @returns {void} */
	function flush() {
		// Do not reenter flush while dirty components are updated, as this can
		// result in an infinite loop. Instead, let the inner flush handle it.
		// Reentrancy is ok afterwards for bindings etc.
		if (flushidx !== 0) {
			return;
		}
		const saved_component = current_component;
		do {
			// first, call beforeUpdate functions
			// and update components
			try {
				while (flushidx < dirty_components.length) {
					const component = dirty_components[flushidx];
					flushidx++;
					set_current_component(component);
					update(component.$$);
				}
			} catch (e) {
				// reset dirty state to not end up in a deadlocked state and then rethrow
				dirty_components.length = 0;
				flushidx = 0;
				throw e;
			}
			set_current_component(null);
			dirty_components.length = 0;
			flushidx = 0;
			while (binding_callbacks.length) binding_callbacks.pop()();
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
		seen_callbacks.clear();
		set_current_component(saved_component);
	}

	/** @returns {void} */
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

	/**
	 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function flush_render_callbacks(fns) {
		const filtered = [];
		const targets = [];
		render_callbacks.forEach((c) => (fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c)));
		targets.forEach((c) => c());
		render_callbacks = filtered;
	}

	/**
	 * @type {Promise<void> | null}
	 */
	let promise;

	/**
	 * @returns {Promise<void>}
	 */
	function wait() {
		if (!promise) {
			promise = Promise.resolve();
			promise.then(() => {
				promise = null;
			});
		}
		return promise;
	}

	/**
	 * @param {Element} node
	 * @param {INTRO | OUTRO | boolean} direction
	 * @param {'start' | 'end'} kind
	 * @returns {void}
	 */
	function dispatch(node, direction, kind) {
		node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
	}

	const outroing = new Set();

	/**
	 * @type {Outro}
	 */
	let outros;

	/**
	 * @returns {void} */
	function group_outros() {
		outros = {
			r: 0,
			c: [],
			p: outros // parent group
		};
	}

	/**
	 * @returns {void} */
	function check_outros() {
		if (!outros.r) {
			run_all(outros.c);
		}
		outros = outros.p;
	}

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} [local]
	 * @returns {void}
	 */
	function transition_in(block, local) {
		if (block && block.i) {
			outroing.delete(block);
			block.i(local);
		}
	}

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} local
	 * @param {0 | 1} [detach]
	 * @param {() => void} [callback]
	 * @returns {void}
	 */
	function transition_out(block, local, detach, callback) {
		if (block && block.o) {
			if (outroing.has(block)) return;
			outroing.add(block);
			outros.c.push(() => {
				outroing.delete(block);
				if (callback) {
					if (detach) block.d(1);
					callback();
				}
			});
			block.o(local);
		} else if (callback) {
			callback();
		}
	}

	/**
	 * @type {import('../transition/public.js').TransitionConfig}
	 */
	const null_transition = { duration: 0 };

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {TransitionFn} fn
	 * @param {any} params
	 * @param {boolean} intro
	 * @returns {{ run(b: 0 | 1): void; end(): void; }}
	 */
	function create_bidirectional_transition(node, fn, params, intro) {
		/**
		 * @type {TransitionOptions} */
		const options = { direction: 'both' };
		let config = fn(node, params, options);
		let t = intro ? 0 : 1;

		/**
		 * @type {Program | null} */
		let running_program = null;

		/**
		 * @type {PendingProgram | null} */
		let pending_program = null;
		let animation_name = null;

		/** @type {boolean} */
		let original_inert_value;

		/**
		 * @returns {void} */
		function clear_animation() {
			if (animation_name) delete_rule(node, animation_name);
		}

		/**
		 * @param {PendingProgram} program
		 * @param {number} duration
		 * @returns {Program}
		 */
		function init(program, duration) {
			const d = /** @type {Program['d']} */ (program.b - t);
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

		/**
		 * @param {INTRO | OUTRO} b
		 * @returns {void}
		 */
		function go(b) {
			const {
				delay = 0,
				duration = 300,
				easing = identity,
				tick = noop,
				css
			} = config || null_transition;

			/**
			 * @type {PendingProgram} */
			const program = {
				start: now() + delay,
				b
			};

			if (!b) {
				// @ts-ignore todo: improve typings
				program.group = outros;
				outros.r += 1;
			}

			if ('inert' in node) {
				if (b) {
					if (original_inert_value !== undefined) {
						// aborted/reversed outro — restore previous inert value
						node.inert = original_inert_value;
					}
				} else {
					original_inert_value = /** @type {HTMLElement} */ (node).inert;
					node.inert = true;
				}
			}

			if (running_program || pending_program) {
				pending_program = program;
			} else {
				// if this is an intro, and there's a delay, we need to do
				// an initial tick and/or apply CSS animation immediately
				if (css) {
					clear_animation();
					animation_name = create_rule(node, t, b, duration, delay, easing, css);
				}
				if (b) tick(0, 1);
				running_program = init(program, duration);
				add_render_callback(() => dispatch(node, b, 'start'));
				loop((now) => {
					if (pending_program && now > pending_program.start) {
						running_program = init(pending_program, duration);
						pending_program = null;
						dispatch(node, running_program.b, 'start');
						if (css) {
							clear_animation();
							animation_name = create_rule(
								node,
								t,
								running_program.b,
								running_program.duration,
								0,
								easing,
								config.css
							);
						}
					}
					if (running_program) {
						if (now >= running_program.end) {
							tick((t = running_program.b), 1 - t);
							dispatch(node, running_program.b, 'end');
							if (!pending_program) {
								// we're done
								if (running_program.b) {
									// intro — we can tidy up immediately
									clear_animation();
								} else {
									// outro — needs to be coordinated
									if (!--running_program.group.r) run_all(running_program.group.c);
								}
							}
							running_program = null;
						} else if (now >= running_program.start) {
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
						const opts = { direction: b ? 'in' : 'out' };
						// @ts-ignore
						config = config(opts);
						go(b);
					});
				} else {
					go(b);
				}
			},
			end() {
				clear_animation();
				running_program = pending_program = null;
			}
		};
	}

	/** @typedef {1} INTRO */
	/** @typedef {0} OUTRO */
	/** @typedef {{ direction: 'in' | 'out' | 'both' }} TransitionOptions */
	/** @typedef {(node: Element, params: any, options: TransitionOptions) => import('../transition/public.js').TransitionConfig} TransitionFn */

	/**
	 * @typedef {Object} Outro
	 * @property {number} r
	 * @property {Function[]} c
	 * @property {Object} p
	 */

	/**
	 * @typedef {Object} PendingProgram
	 * @property {number} start
	 * @property {INTRO|OUTRO} b
	 * @property {Outro} [group]
	 */

	/**
	 * @typedef {Object} Program
	 * @property {number} a
	 * @property {INTRO|OUTRO} b
	 * @property {1|-1} d
	 * @property {number} duration
	 * @property {number} start
	 * @property {number} end
	 * @property {Outro} [group]
	 */

	// general each functions:

	function ensure_array_like(array_like_or_iterator) {
		return array_like_or_iterator?.length !== undefined
			? array_like_or_iterator
			: Array.from(array_like_or_iterator);
	}

	/** @returns {void} */
	function bind(component, name, callback) {
		const index = component.$$.props[name];
		if (index !== undefined) {
			component.$$.bound[index] = callback;
			callback(component.$$.ctx[index]);
		}
	}

	/** @returns {void} */
	function create_component(block) {
		block && block.c();
	}

	/** @returns {void} */
	function claim_component(block, parent_nodes) {
		block && block.l(parent_nodes);
	}

	/** @returns {void} */
	function mount_component(component, target, anchor) {
		const { fragment, after_update } = component.$$;
		fragment && fragment.m(target, anchor);
		// onMount happens before the initial afterUpdate
		add_render_callback(() => {
			const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
			// if the component was destroyed immediately
			// it will update the `$$.on_destroy` reference to `null`.
			// the destructured on_destroy may still reference to the old array
			if (component.$$.on_destroy) {
				component.$$.on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});
		after_update.forEach(add_render_callback);
	}

	/** @returns {void} */
	function destroy_component(component, detaching) {
		const $$ = component.$$;
		if ($$.fragment !== null) {
			flush_render_callbacks($$.after_update);
			run_all($$.on_destroy);
			$$.fragment && $$.fragment.d(detaching);
			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			$$.on_destroy = $$.fragment = null;
			$$.ctx = [];
		}
	}

	/** @returns {void} */
	function make_dirty(component, i) {
		if (component.$$.dirty[0] === -1) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty.fill(0);
		}
		component.$$.dirty[(i / 31) | 0] |= 1 << i % 31;
	}

	// TODO: Document the other params
	/**
	 * @param {SvelteComponent} component
	 * @param {import('./public.js').ComponentConstructorOptions} options
	 *
	 * @param {import('./utils.js')['not_equal']} not_equal Used to compare props and state values.
	 * @param {(target: Element | ShadowRoot) => void} [append_styles] Function that appends styles to the DOM when the component is first initialised.
	 * This will be the `add_css` function from the compiled component.
	 *
	 * @returns {void}
	 */
	function init(
		component,
		options,
		instance,
		create_fragment,
		not_equal,
		props,
		append_styles = null,
		dirty = [-1]
	) {
		const parent_component = current_component;
		set_current_component(component);
		/** @type {import('./private.js').T$$} */
		const $$ = (component.$$ = {
			fragment: null,
			ctx: [],
			// state
			props,
			update: noop,
			not_equal,
			bound: blank_object(),
			// lifecycle
			on_mount: [],
			on_destroy: [],
			on_disconnect: [],
			before_update: [],
			after_update: [],
			context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
			// everything else
			callbacks: blank_object(),
			dirty,
			skip_bound: false,
			root: options.target || parent_component.$$.root
		});
		append_styles && append_styles($$.root);
		let ready = false;
		$$.ctx = instance
			? instance(component, options.props || {}, (i, ret, ...rest) => {
					const value = rest.length ? rest[0] : ret;
					if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {
						if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
						if (ready) make_dirty(component, i);
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
				start_hydrating();
				// TODO: what is the correct type here?
				// @ts-expect-error
				const nodes = children(options.target);
				$$.fragment && $$.fragment.l(nodes);
				nodes.forEach(detach);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				$$.fragment && $$.fragment.c();
			}
			if (options.intro) transition_in(component.$$.fragment);
			mount_component(component, options.target, options.anchor);
			end_hydrating();
			flush();
		}
		set_current_component(parent_component);
	}

	/**
	 * Base class for Svelte components. Used when dev=false.
	 *
	 * @template {Record<string, any>} [Props=any]
	 * @template {Record<string, any>} [Events=any]
	 */
	class SvelteComponent {
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$ = undefined;
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$set = undefined;

		/** @returns {void} */
		$destroy() {
			destroy_component(this, 1);
			this.$destroy = noop;
		}

		/**
		 * @template {Extract<keyof Events, string>} K
		 * @param {K} type
		 * @param {((e: Events[K]) => void) | null | undefined} callback
		 * @returns {() => void}
		 */
		$on(type, callback) {
			if (!is_function(callback)) {
				return noop;
			}
			const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
			callbacks.push(callback);
			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		/**
		 * @param {Partial<Props>} props
		 * @returns {void}
		 */
		$set(props) {
			if (this.$$set && !is_empty(props)) {
				this.$$.skip_bound = true;
				this.$$set(props);
				this.$$.skip_bound = false;
			}
		}
	}

	/**
	 * @typedef {Object} CustomElementPropDefinition
	 * @property {string} [attribute]
	 * @property {boolean} [reflect]
	 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
	 */

	// generated during release, do not modify

	const PUBLIC_VERSION = '4';

	if (typeof window !== 'undefined')
		// @ts-ignore
		(window.__svelte || (window.__svelte = { v: new Set() })).v.add(PUBLIC_VERSION);

	/* ../src/Toolbar.svelte generated by Svelte v4.2.20 */

	function get_each_context$5(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[5] = list[i];
		return child_ctx;
	}

	// (14:33) 
	function create_if_block_2(ctx) {
		let button;
		let textContent = "Check";
		let mounted;
		let dispose;

		return {
			c() {
				button = element("button");
				button.textContent = textContent;
				this.h();
			},
			l(nodes) {
				button = claim_element(nodes, "BUTTON", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(button) !== "svelte-eqqel") button.textContent = textContent;
				this.h();
			},
			h() {
				attr(button, "class", "svelte-e4q29q");
			},
			m(target, anchor) {
				insert_hydration(target, button, anchor);

				if (!mounted) {
					dispose = listen(button, "click", /*click_handler_2*/ ctx[4]);
					mounted = true;
				}
			},
			p: noop,
			d(detaching) {
				if (detaching) {
					detach(button);
				}

				mounted = false;
				dispose();
			}
		};
	}

	// (12:34) 
	function create_if_block_1$3(ctx) {
		let button;
		let textContent = "Reveal";
		let mounted;
		let dispose;

		return {
			c() {
				button = element("button");
				button.textContent = textContent;
				this.h();
			},
			l(nodes) {
				button = claim_element(nodes, "BUTTON", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(button) !== "svelte-10vdg71") button.textContent = textContent;
				this.h();
			},
			h() {
				attr(button, "class", "svelte-e4q29q");
			},
			m(target, anchor) {
				insert_hydration(target, button, anchor);

				if (!mounted) {
					dispose = listen(button, "click", /*click_handler_1*/ ctx[3]);
					mounted = true;
				}
			},
			p: noop,
			d(detaching) {
				if (detaching) {
					detach(button);
				}

				mounted = false;
				dispose();
			}
		};
	}

	// (10:4) {#if action === 'clear'}
	function create_if_block$5(ctx) {
		let button;
		let textContent = "Clear";
		let mounted;
		let dispose;

		return {
			c() {
				button = element("button");
				button.textContent = textContent;
				this.h();
			},
			l(nodes) {
				button = claim_element(nodes, "BUTTON", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(button) !== "svelte-2x3pxt") button.textContent = textContent;
				this.h();
			},
			h() {
				attr(button, "class", "svelte-e4q29q");
			},
			m(target, anchor) {
				insert_hydration(target, button, anchor);

				if (!mounted) {
					dispose = listen(button, "click", /*click_handler*/ ctx[2]);
					mounted = true;
				}
			},
			p: noop,
			d(detaching) {
				if (detaching) {
					detach(button);
				}

				mounted = false;
				dispose();
			}
		};
	}

	// (9:2) {#each actions as action}
	function create_each_block$5(ctx) {
		let if_block_anchor;

		function select_block_type(ctx, dirty) {
			if (/*action*/ ctx[5] === 'clear') return create_if_block$5;
			if (/*action*/ ctx[5] === 'reveal') return create_if_block_1$3;
			if (/*action*/ ctx[5] === 'check') return create_if_block_2;
		}

		let current_block_type = select_block_type(ctx);
		let if_block = current_block_type && current_block_type(ctx);

		return {
			c() {
				if (if_block) if_block.c();
				if_block_anchor = empty();
			},
			l(nodes) {
				if (if_block) if_block.l(nodes);
				if_block_anchor = empty();
			},
			m(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert_hydration(target, if_block_anchor, anchor);
			},
			p(ctx, dirty) {
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
			d(detaching) {
				if (detaching) {
					detach(if_block_anchor);
				}

				if (if_block) {
					if_block.d(detaching);
				}
			}
		};
	}

	function create_fragment$b(ctx) {
		let div;
		let each_value = ensure_array_like(/*actions*/ ctx[0]);
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
		}

		return {
			c() {
				div = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				this.h();
			},
			l(nodes) {
				div = claim_element(nodes, "DIV", { class: true });
				var div_nodes = children(div);

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].l(div_nodes);
				}

				div_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(div, "class", "toolbar svelte-e4q29q");
			},
			m(target, anchor) {
				insert_hydration(target, div, anchor);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div, null);
					}
				}
			},
			p(ctx, [dirty]) {
				if (dirty & /*dispatch, actions*/ 3) {
					each_value = ensure_array_like(/*actions*/ ctx[0]);
					let i;

					for (i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$5(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
						} else {
							each_blocks[i] = create_each_block$5(child_ctx);
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
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				destroy_each(each_blocks, detaching);
			}
		};
	}

	function instance$b($$self, $$props, $$invalidate) {
		const dispatch = createEventDispatcher();
		let { actions = ["clear", "reveal", "check"] } = $$props;
		const click_handler = () => dispatch('event', 'clear');
		const click_handler_1 = () => dispatch('event', 'reveal');
		const click_handler_2 = () => dispatch('event', 'check');

		$$self.$$set = $$props => {
			if ('actions' in $$props) $$invalidate(0, actions = $$props.actions);
		};

		return [actions, dispatch, click_handler, click_handler_1, click_handler_2];
	}

	class Toolbar extends SvelteComponent {
		constructor(options) {
			super();
			init(this, options, instance$b, create_fragment$b, safe_not_equal, { actions: 0 });
		}
	}

	var qwertyStandard = [{
		"row": 0,
		"value": "q"
	}, {
		"row": 0,
		"value": "w"
	}, {
		"row": 0,
		"value": "e"
	}, {
		"row": 0,
		"value": "r"
	}, {
		"row": 0,
		"value": "t"
	}, {
		"row": 0,
		"value": "y"
	}, {
		"row": 0,
		"value": "u"
	},  {
		"row": 0,
		"value": "i"
	},  {
		"row": 0,
		"value": "o"
	},  {
		"row": 0,
		"value": "p"
	}, {
		"row": 1,
		"value": "a"
	}, {
		"row": 1,
		"value": "s"
	}, {
		"row": 1,
		"value": "d"
	}, {
		"row": 1,
		"value": "f"
	}, {
		"row": 1,
		"value": "g"
	}, {
		"row": 1,
		"value": "h"
	}, {
		"row": 1,
		"value": "j"
	}, {
		"row": 1,
		"value": "k"
	}, {
		"row": 1,
		"value": "l"
	}, {
		"row": 2,
		"value": "Shift",
	}, {
		"row": 2,
		"value": "z"
	}, {
		"row": 2,
		"value": "x"
	}, {
		"row": 2,
		"value": "c"
	}, {
		"row": 2,
		"value": "v"
	}, {
		"row": 2,
		"value": "b"
	}, {
		"row": 2,
		"value": "n"
	}, {
		"row": 2,
		"value": "m"
	}, {
		"row": 2,
		"value": "Backspace"
	}, {
		"row": 3,
		"value": "Page1",
	},  {
		"row": 3,
		"value": ",",
	},  {
		"row": 3,
		"value": "Space",
	},  {
		"row": 3,
		"value": ".",
	},  {
		"row": 3,
		"value": "Enter",
	}, {
		"row": 0,
		"value": "1",
		"page": 1
	}, {
		"row": 0,
		"value": "2",
		"page": 1
	}, {
		"row": 0,
		"value": "3",
		"page": 1
	}, {
		"row": 0,
		"value": "4",
		"page": 1
	}, {
		"row": 0,
		"value": "5",
		"page": 1
	}, {
		"row": 0,
		"value": "6",
		"page": 1
	}, {
		"row": 0,
		"value": "7",
		"page": 1
	}, {
		"row": 0,
		"value": "8",
		"page": 1
	}, {
		"row": 0,
		"value": "9",
		"page": 1
	}, {
		"row": 0,
		"value": "0",
		"page": 1
	}, {
		"row": 1,
		"value": "!",
		"page": 1
	}, {
		"row": 1,
		"value": "@",
		"page": 1
	}, {
		"row": 1,
		"value": "#",
		"page": 1
	}, {
		"row": 1,
		"value": "$",
		"page": 1
	}, {
		"row": 1,
		"value": "%",
		"page": 1
	}, {
		"row": 1,
		"value": "^",
		"page": 1
	}, {
		"row": 1,
		"value": "&",
		"page": 1
	}, {
		"row": 1,
		"value": "*",
		"page": 1
	}, {
		"row": 1,
		"value": "(",
		"page": 1
	}, {
		"row": 1,
		"value": ")",
		"page": 1
	}, {
		"row": 2,
		"value": "-",
		"page": 1
	}, {
		"row": 2,
		"value": "_",
		"page": 1
	}, {
		"row": 2,
		"value": "=",
		"page": 1
	}, {
		"row": 2,
		"value": "+",
		"page": 1
	}, {
		"row": 2,
		"value": ";",
		"page": 1
	}, {
		"row": 2,
		"value": ":",
		"page": 1
	}, {
		"row": 2,
		"value": "'",
		"page": 1
	}, {
		"row": 2,
		"value": "\"",
		"page": 1
	}, {
		"row": 2,
		"value": "<",
		"page": 1
	}, {
		"row": 2,
		"value": ">",
		"page": 1
	}, {
		"row": 3,
		"value": "Page0",
		"page": 1
	}, {
		"row": 3,
		"value": "/",
		"page": 1
	}, {
		"row": 3,
		"value": "?",
		"page": 1
	}, {
		"row": 3,
		"value": "[",
		"page": 1
	}, {
		"row": 3,
		"value": "]",
		"page": 1
	}, {
		"row": 3,
		"value": "{",
		"page": 1
	}, {
		"row": 3,
		"value": "}",
		"page": 1
	}, {
		"row": 3,
		"value": "|",
		"page": 1
	}, {
		"row": 3,
		"value": "\\",
		"page": 1
	}, {
		"row": 3,
		"value": "~",
		"page": 1
	}];

	var qwertyCrossword = [{
		"row": 0,
		"value": "q"
	}, {
		"row": 0,
		"value": "w"
	}, {
		"row": 0,
		"value": "e"
	}, {
		"row": 0,
		"value": "r"
	}, {
		"row": 0,
		"value": "t"
	}, {
		"row": 0,
		"value": "y"
	}, {
		"row": 0,
		"value": "u"
	}, {
		"row": 0,
		"value": "i"
	}, {
		"row": 0,
		"value": "o"
	}, {
		"row": 0,
		"value": "p"
	}, {
		"row": 1,
		"value": "a"
	}, {
		"row": 1,
		"value": "s"
	}, {
		"row": 1,
		"value": "d"
	}, {
		"row": 1,
		"value": "f"
	}, {
		"row": 1,
		"value": "g"
	}, {
		"row": 1,
		"value": "h"
	}, {
		"row": 1,
		"value": "j"
	}, {
		"row": 1,
		"value": "k"
	}, {
		"row": 1,
		"value": "l"
	}, {
		"row": 2,
		"value": "z"
	}, {
		"row": 2,
		"value": "x"
	}, {
		"row": 2,
		"value": "c"
	}, {
		"row": 2,
		"value": "v"
	}, {
		"row": 2,
		"value": "b"
	}, {
		"row": 2,
		"value": "n"
	}, {
		"row": 2,
		"value": "m"
	}, {
		"row": 2,
		"value": "Backspace"
	}];

	var qwertyWordle = [{
		"row": 0,
		"value": "q"
	}, {
		"row": 0,
		"value": "w"
	}, {
		"row": 0,
		"value": "e"
	}, {
		"row": 0,
		"value": "r"
	}, {
		"row": 0,
		"value": "t"
	}, {
		"row": 0,
		"value": "y"
	}, {
		"row": 0,
		"value": "u"
	}, {
		"row": 0,
		"value": "i"
	}, {
		"row": 0,
		"value": "o"
	}, {
		"row": 0,
		"value": "p"
	}, {
		"row": 1,
		"value": "a"
	}, {
		"row": 1,
		"value": "s"
	}, {
		"row": 1,
		"value": "d"
	}, {
		"row": 1,
		"value": "f"
	}, {
		"row": 1,
		"value": "g"
	}, {
		"row": 1,
		"value": "h"
	}, {
		"row": 1,
		"value": "j"
	}, {
		"row": 1,
		"value": "k"
	}, {
		"row": 1,
		"value": "l"
	}, {
		"row": 2,
		"value": "Enter"
	}, {
		"row": 2,
		"value": "z"
	}, {
		"row": 2,
		"value": "x"
	}, {
		"row": 2,
		"value": "c"
	}, {
		"row": 2,
		"value": "v"
	}, {
		"row": 2,
		"value": "b"
	}, {
		"row": 2,
		"value": "n"
	}, {
		"row": 2,
		"value": "m"
	}, {
		"row": 2,
		"value": "Backspace"
	}];

	var azertyStandard = [{
		"row": 0,
		"value": "a"
	}, {
		"row": 0,
		"value": "z"
	}, {
		"row": 0,
		"value": "e"
	}, {
		"row": 0,
		"value": "r"
	}, {
		"row": 0,
		"value": "t"
	}, {
		"row": 0,
		"value": "y"
	}, {
		"row": 0,
		"value": "u"
	},  {
		"row": 0,
		"value": "i"
	},  {
		"row": 0,
		"value": "o"
	},  {
		"row": 0,
		"value": "p"
	}, {
		"row": 1,
		"value": "q"
	}, {
		"row": 1,
		"value": "s"
	}, {
		"row": 1,
		"value": "d"
	}, {
		"row": 1,
		"value": "f"
	}, {
		"row": 1,
		"value": "g"
	}, {
		"row": 1,
		"value": "h"
	}, {
		"row": 1,
		"value": "j"
	}, {
		"row": 1,
		"value": "k"
	}, {
		"row": 1,
		"value": "l"
	}, {
		"row": 1,
		"value": "m"
	}, {
		"row": 2,
		"value": "Shift",
	}, {
		"row": 2,
		"value": "w"
	}, {
		"row": 2,
		"value": "x"
	}, {
		"row": 2,
		"value": "c"
	}, {
		"row": 2,
		"value": "v"
	}, {
		"row": 2,
		"value": "b"
	}, {
		"row": 2,
		"value": "n"
	}, {
		"row": 2,
		"value": "Backspace"
	}, {
		"row": 3,
		"value": "Page1",
	},  {
		"row": 3,
		"value": ",",
	},  {
		"row": 3,
		"value": "Space",
	},  {
		"row": 3,
		"value": ".",
	},  {
		"row": 3,
		"value": "Enter",
	}, {
		"row": 0,
		"value": "1",
		"page": 1
	}, {
		"row": 0,
		"value": "2",
		"page": 1
	}, {
		"row": 0,
		"value": "3",
		"page": 1
	}, {
		"row": 0,
		"value": "4",
		"page": 1
	}, {
		"row": 0,
		"value": "5",
		"page": 1
	}, {
		"row": 0,
		"value": "6",
		"page": 1
	}, {
		"row": 0,
		"value": "7",
		"page": 1
	}, {
		"row": 0,
		"value": "8",
		"page": 1
	}, {
		"row": 0,
		"value": "9",
		"page": 1
	}, {
		"row": 0,
		"value": "0",
		"page": 1
	}, {
		"row": 1,
		"value": "!",
		"page": 1
	}, {
		"row": 1,
		"value": "@",
		"page": 1
	}, {
		"row": 1,
		"value": "#",
		"page": 1
	}, {
		"row": 1,
		"value": "$",
		"page": 1
	}, {
		"row": 1,
		"value": "%",
		"page": 1
	}, {
		"row": 1,
		"value": "^",
		"page": 1
	}, {
		"row": 1,
		"value": "&",
		"page": 1
	}, {
		"row": 1,
		"value": "*",
		"page": 1
	}, {
		"row": 1,
		"value": "(",
		"page": 1
	}, {
		"row": 1,
		"value": ")",
		"page": 1
	}, {
		"row": 2,
		"value": "-",
		"page": 1
	}, {
		"row": 2,
		"value": "_",
		"page": 1
	}, {
		"row": 2,
		"value": "=",
		"page": 1
	}, {
		"row": 2,
		"value": "+",
		"page": 1
	}, {
		"row": 2,
		"value": ";",
		"page": 1
	}, {
		"row": 2,
		"value": ":",
		"page": 1
	}, {
		"row": 2,
		"value": "'",
		"page": 1
	}, {
		"row": 2,
		"value": "\"",
		"page": 1
	}, {
		"row": 2,
		"value": "<",
		"page": 1
	}, {
		"row": 2,
		"value": ">",
		"page": 1
	}, {
		"row": 3,
		"value": "Page0",
		"page": 1
	}, {
		"row": 3,
		"value": "/",
		"page": 1
	}, {
		"row": 3,
		"value": "?",
		"page": 1
	}, {
		"row": 3,
		"value": "[",
		"page": 1
	}, {
		"row": 3,
		"value": "]",
		"page": 1
	}, {
		"row": 3,
		"value": "{",
		"page": 1
	}, {
		"row": 3,
		"value": "}",
		"page": 1
	}, {
		"row": 3,
		"value": "|",
		"page": 1
	}, {
		"row": 3,
		"value": "\\",
		"page": 1
	}, {
		"row": 3,
		"value": "~",
		"page": 1
	}];

	var azertyCrossword = [{
		"row": 0,
		"value": "a"
	}, {
		"row": 0,
		"value": "z"
	}, {
		"row": 0,
		"value": "e"
	}, {
		"row": 0,
		"value": "r"
	}, {
		"row": 0,
		"value": "t"
	}, {
		"row": 0,
		"value": "y"
	}, {
		"row": 0,
		"value": "u"
	}, {
		"row": 0,
		"value": "i"
	}, {
		"row": 0,
		"value": "o"
	}, {
		"row": 0,
		"value": "p"
	}, {
		"row": 1,
		"value": "q"
	}, {
		"row": 1,
		"value": "s"
	}, {
		"row": 1,
		"value": "d"
	}, {
		"row": 1,
		"value": "f"
	}, {
		"row": 1,
		"value": "g"
	}, {
		"row": 1,
		"value": "h"
	}, {
		"row": 1,
		"value": "j"
	}, {
		"row": 1,
		"value": "k"
	}, {
		"row": 1,
		"value": "l"
	}, {
		"row": 1,
		"value": "m"
	}, {
		"row": 2,
		"value": "w"
	}, {
		"row": 2,
		"value": "x"
	}, {
		"row": 2,
		"value": "c"
	}, {
		"row": 2,
		"value": "v"
	}, {
		"row": 2,
		"value": "b"
	}, {
		"row": 2,
		"value": "n"
	}, {
		"row": 2,
		"value": "Backspace"
	}];

	var azertyWordle = [{
		"row": 0,
		"value": "a"
	}, {
		"row": 0,
		"value": "z"
	}, {
		"row": 0,
		"value": "e"
	}, {
		"row": 0,
		"value": "r"
	}, {
		"row": 0,
		"value": "t"
	}, {
		"row": 0,
		"value": "y"
	}, {
		"row": 0,
		"value": "u"
	}, {
		"row": 0,
		"value": "i"
	}, {
		"row": 0,
		"value": "o"
	}, {
		"row": 0,
		"value": "p"
	}, {
		"row": 1,
		"value": "q"
	}, {
		"row": 1,
		"value": "s"
	}, {
		"row": 1,
		"value": "d"
	}, {
		"row": 1,
		"value": "f"
	}, {
		"row": 1,
		"value": "g"
	}, {
		"row": 1,
		"value": "h"
	}, {
		"row": 1,
		"value": "j"
	}, {
		"row": 1,
		"value": "k"
	}, {
		"row": 1,
		"value": "l"
	}, {
		"row": 1,
		"value": "m"
	}, {
		"row": 2,
		"value": "Enter"
	}, {
		"row": 2,
		"value": "w"
	}, {
		"row": 2,
		"value": "x"
	}, {
		"row": 2,
		"value": "c"
	}, {
		"row": 2,
		"value": "v"
	}, {
		"row": 2,
		"value": "b"
	}, {
		"row": 2,
		"value": "n"
	}, {
		"row": 2,
		"value": "Backspace"
	}];

	var backspaceSVG = `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-delete"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>`;

	var enterSVG = `<svg width="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-corner-down-left"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>`;

	/* ../node_modules/svelte-keyboard/Keyboard.svelte generated by Svelte v4.2.20 */

	function get_each_context$4(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[27] = list[i];
		child_ctx[29] = i;
		return child_ctx;
	}

	function get_each_context_1(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[30] = list[i];
		return child_ctx;
	}

	function get_each_context_2(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[33] = list[i].value;
		child_ctx[34] = list[i].display;
		return child_ctx;
	}

	// (122:14) {:else}
	function create_else_block(ctx) {
		let t_value = /*display*/ ctx[34] + "";
		let t;

		return {
			c() {
				t = text(t_value);
			},
			l(nodes) {
				t = claim_text(nodes, t_value);
			},
			m(target, anchor) {
				insert_hydration(target, t, anchor);
			},
			p(ctx, dirty) {
				if (dirty[0] & /*rowData*/ 8 && t_value !== (t_value = /*display*/ ctx[34] + "")) set_data(t, t_value);
			},
			d(detaching) {
				if (detaching) {
					detach(t);
				}
			}
		};
	}

	// (120:14) {#if display.includes("<svg")}
	function create_if_block$4(ctx) {
		let html_tag;
		let raw_value = /*display*/ ctx[34] + "";
		let html_anchor;

		return {
			c() {
				html_tag = new HtmlTagHydration(false);
				html_anchor = empty();
				this.h();
			},
			l(nodes) {
				html_tag = claim_html_tag(nodes, false);
				html_anchor = empty();
				this.h();
			},
			h() {
				html_tag.a = html_anchor;
			},
			m(target, anchor) {
				html_tag.m(raw_value, target, anchor);
				insert_hydration(target, html_anchor, anchor);
			},
			p(ctx, dirty) {
				if (dirty[0] & /*rowData*/ 8 && raw_value !== (raw_value = /*display*/ ctx[34] + "")) html_tag.p(raw_value);
			},
			d(detaching) {
				if (detaching) {
					detach(html_anchor);
					html_tag.d();
				}
			}
		};
	}

	// (109:10) {#each keys as { value, display }}
	function create_each_block_2(ctx) {
		let button;
		let show_if;
		let button_class_value;
		let mounted;
		let dispose;

		function select_block_type(ctx, dirty) {
			if (dirty[0] & /*rowData*/ 8) show_if = null;
			if (show_if == null) show_if = !!/*display*/ ctx[34].includes("<svg");
			if (show_if) return create_if_block$4;
			return create_else_block;
		}

		let current_block_type = select_block_type(ctx, [-1, -1]);
		let if_block = current_block_type(ctx);

		function touchstart_handler(...args) {
			return /*touchstart_handler*/ ctx[19](/*value*/ ctx[33], ...args);
		}

		function mousedown_handler(...args) {
			return /*mousedown_handler*/ ctx[20](/*value*/ ctx[33], ...args);
		}

		function touchend_handler() {
			return /*touchend_handler*/ ctx[21](/*value*/ ctx[33]);
		}

		function mouseup_handler() {
			return /*mouseup_handler*/ ctx[22](/*value*/ ctx[33]);
		}

		return {
			c() {
				button = element("button");
				if_block.c();
				this.h();
			},
			l(nodes) {
				button = claim_element(nodes, "BUTTON", { type: true, class: true });
				var button_nodes = children(button);
				if_block.l(button_nodes);
				button_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(button, "type", "button");
				attr(button, "class", button_class_value = "key key--" + /*value*/ ctx[33] + " " + (/*keyClass*/ ctx[0][/*value*/ ctx[33]] || '') + " svelte-1bx3au8");
				toggle_class(button, "single", /*value*/ ctx[33].length === 1);
				toggle_class(button, "active", /*value*/ ctx[33] === /*active*/ ctx[2]);
			},
			m(target, anchor) {
				insert_hydration(target, button, anchor);
				if_block.m(button, null);

				if (!mounted) {
					dispose = [
						listen(button, "touchstart", touchstart_handler),
						listen(button, "mousedown", mousedown_handler),
						listen(button, "touchend", touchend_handler, { passive: true }),
						listen(button, "mouseup", mouseup_handler)
					];

					mounted = true;
				}
			},
			p(new_ctx, dirty) {
				ctx = new_ctx;

				if (current_block_type === (current_block_type = select_block_type(ctx, dirty)) && if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block.d(1);
					if_block = current_block_type(ctx);

					if (if_block) {
						if_block.c();
						if_block.m(button, null);
					}
				}

				if (dirty[0] & /*rowData, keyClass*/ 9 && button_class_value !== (button_class_value = "key key--" + /*value*/ ctx[33] + " " + (/*keyClass*/ ctx[0][/*value*/ ctx[33]] || '') + " svelte-1bx3au8")) {
					attr(button, "class", button_class_value);
				}

				if (dirty[0] & /*rowData, keyClass, rowData*/ 9) {
					toggle_class(button, "single", /*value*/ ctx[33].length === 1);
				}

				if (dirty[0] & /*rowData, keyClass, rowData, active*/ 13) {
					toggle_class(button, "active", /*value*/ ctx[33] === /*active*/ ctx[2]);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(button);
				}

				if_block.d();
				mounted = false;
				run_all(dispose);
			}
		};
	}

	// (107:6) {#each row as keys}
	function create_each_block_1(ctx) {
		let div;
		let each_value_2 = ensure_array_like(/*keys*/ ctx[30]);
		let each_blocks = [];

		for (let i = 0; i < each_value_2.length; i += 1) {
			each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
		}

		return {
			c() {
				div = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				this.h();
			},
			l(nodes) {
				div = claim_element(nodes, "DIV", { class: true });
				var div_nodes = children(div);

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].l(div_nodes);
				}

				div_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(div, "class", "row row--" + /*i*/ ctx[29] + " svelte-1bx3au8");
			},
			m(target, anchor) {
				insert_hydration(target, div, anchor);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div, null);
					}
				}
			},
			p(ctx, dirty) {
				if (dirty[0] & /*rowData, keyClass, active, onKeyStart, onKeyEnd*/ 61) {
					each_value_2 = ensure_array_like(/*keys*/ ctx[30]);
					let i;

					for (i = 0; i < each_value_2.length; i += 1) {
						const child_ctx = get_each_context_2(ctx, each_value_2, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
						} else {
							each_blocks[i] = create_each_block_2(child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(div, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}

					each_blocks.length = each_value_2.length;
				}
			},
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				destroy_each(each_blocks, detaching);
			}
		};
	}

	// (105:2) {#each rowData as row, i}
	function create_each_block$4(ctx) {
		let div;
		let t;
		let each_value_1 = ensure_array_like(/*row*/ ctx[27]);
		let each_blocks = [];

		for (let i = 0; i < each_value_1.length; i += 1) {
			each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
		}

		return {
			c() {
				div = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				t = space();
				this.h();
			},
			l(nodes) {
				div = claim_element(nodes, "DIV", { class: true });
				var div_nodes = children(div);

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].l(div_nodes);
				}

				t = claim_space(div_nodes);
				div_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(div, "class", "page svelte-1bx3au8");
				toggle_class(div, "visible", /*i*/ ctx[29] === /*page*/ ctx[1]);
			},
			m(target, anchor) {
				insert_hydration(target, div, anchor);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div, null);
					}
				}

				append_hydration(div, t);
			},
			p(ctx, dirty) {
				if (dirty[0] & /*rowData, keyClass, active, onKeyStart, onKeyEnd*/ 61) {
					each_value_1 = ensure_array_like(/*row*/ ctx[27]);
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

				if (dirty[0] & /*page*/ 2) {
					toggle_class(div, "visible", /*i*/ ctx[29] === /*page*/ ctx[1]);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				destroy_each(each_blocks, detaching);
			}
		};
	}

	function create_fragment$a(ctx) {
		let div;
		let each_value = ensure_array_like(/*rowData*/ ctx[3]);
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
		}

		return {
			c() {
				div = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				this.h();
			},
			l(nodes) {
				div = claim_element(nodes, "DIV", { class: true });
				var div_nodes = children(div);

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].l(div_nodes);
				}

				div_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(div, "class", "svelte-keyboard");
			},
			m(target, anchor) {
				insert_hydration(target, div, anchor);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div, null);
					}
				}
			},
			p(ctx, dirty) {
				if (dirty[0] & /*page, rowData, keyClass, active, onKeyStart, onKeyEnd*/ 63) {
					each_value = ensure_array_like(/*rowData*/ ctx[3]);
					let i;

					for (i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$4(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
						} else {
							each_blocks[i] = create_each_block$4(child_ctx);
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
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				destroy_each(each_blocks, detaching);
			}
		};
	}

	const alphabet = "abcdefghijklmnopqrstuvwxyz";

	function instance$a($$self, $$props, $$invalidate) {
		let rawData;
		let data;
		let page0;
		let page1;
		let rows0;
		let rows1;
		let rowData0;
		let rowData1;
		let rowData;
		let { custom } = $$props;
		let { localizationLayout = "qwerty" } = $$props;
		let { layout = "standard" } = $$props;
		let { noSwap = [] } = $$props;
		let { keyClass = {} } = $$props;

		// vars
		let page = 0;

		let shifted = false;
		let active = undefined;

		const layouts = {
			qwerty: {
				standard: qwertyStandard,
				crossword: qwertyCrossword,
				wordle: qwertyWordle
			},
			azerty: {
				standard: azertyStandard,
				crossword: azertyCrossword,
				wordle: azertyWordle
			}
		};

		const dispatch = createEventDispatcher();

		const swaps = {
			Page0: "abc",
			Page1: "?123",
			Space: " ",
			Shift: "abc",
			Enter: enterSVG,
			Backspace: backspaceSVG
		};

		// functions
		const unique = arr => [...new Set(arr)];

		const onKeyStart = (event, value) => {
			event.preventDefault();
			$$invalidate(2, active = value);

			if (value.includes("Page")) {
				$$invalidate(1, page = +value.substr(-1));
			} else if (value === "Shift") {
				$$invalidate(10, shifted = !shifted);
			} else {
				let output = value;
				if (shifted && alphabet.includes(value)) output = value.toUpperCase();
				dispatch("keydown", output);
			}

			event.stopPropagation();
			return false;
		};

		const onKeyEnd = value => {
			setTimeout(
				() => {
					if (value === active) $$invalidate(2, active = undefined);
				},
				50
			);
		};

		const touchstart_handler = (value, e) => onKeyStart(e, value);
		const mousedown_handler = (value, e) => onKeyStart(e, value);
		const touchend_handler = value => onKeyEnd(value);
		const mouseup_handler = value => onKeyEnd(value);

		$$self.$$set = $$props => {
			if ('custom' in $$props) $$invalidate(6, custom = $$props.custom);
			if ('localizationLayout' in $$props) $$invalidate(7, localizationLayout = $$props.localizationLayout);
			if ('layout' in $$props) $$invalidate(8, layout = $$props.layout);
			if ('noSwap' in $$props) $$invalidate(9, noSwap = $$props.noSwap);
			if ('keyClass' in $$props) $$invalidate(0, keyClass = $$props.keyClass);
		};

		$$self.$$.update = () => {
			if ($$self.$$.dirty[0] & /*custom, localizationLayout, layout*/ 448) {
				// reactive vars
				$$invalidate(18, rawData = custom || layouts[localizationLayout][layout] || standard);
			}

			if ($$self.$$.dirty[0] & /*rawData, noSwap, shifted*/ 263680) {
				$$invalidate(17, data = rawData.map(d => {
					let display = d.display;
					const s = swaps[d.value];
					const shouldSwap = s && !noSwap.includes(d.value) && !d.noSwap;
					if (shouldSwap) display = s;
					if (!display) display = shifted ? d.value.toUpperCase() : d.value;
					if (d.value === "Shift") display = shifted ? s : s.toUpperCase();
					return { ...d, display };
				}));
			}

			if ($$self.$$.dirty[0] & /*data*/ 131072) {
				$$invalidate(15, page0 = data.filter(d => !d.page));
			}

			if ($$self.$$.dirty[0] & /*data*/ 131072) {
				$$invalidate(13, page1 = data.filter(d => d.page));
			}

			if ($$self.$$.dirty[0] & /*page0*/ 32768) {
				$$invalidate(14, rows0 = unique(page0.map(d => d.row)));
			}

			if ($$self.$$.dirty[0] & /*rows0*/ 16384) {
				(rows0.sort((a, b) => a - b));
			}

			if ($$self.$$.dirty[0] & /*page1*/ 8192) {
				$$invalidate(16, rows1 = unique(page1.map(d => d.row)));
			}

			if ($$self.$$.dirty[0] & /*rows1*/ 65536) {
				(rows1.sort((a, b) => a - b));
			}

			if ($$self.$$.dirty[0] & /*rows0, page0*/ 49152) {
				$$invalidate(12, rowData0 = rows0.map(r => page0.filter(k => k.row === r)));
			}

			if ($$self.$$.dirty[0] & /*rows0, page1*/ 24576) {
				$$invalidate(11, rowData1 = rows0.map(r => page1.filter(k => k.row === r)));
			}

			if ($$self.$$.dirty[0] & /*rowData0, rowData1*/ 6144) {
				$$invalidate(3, rowData = [rowData0, rowData1]);
			}
		};

		return [
			keyClass,
			page,
			active,
			rowData,
			onKeyStart,
			onKeyEnd,
			custom,
			localizationLayout,
			layout,
			noSwap,
			shifted,
			rowData1,
			rowData0,
			page1,
			rows0,
			page0,
			rows1,
			data,
			rawData,
			touchstart_handler,
			mousedown_handler,
			touchend_handler,
			mouseup_handler
		];
	}

	class Keyboard extends SvelteComponent {
		constructor(options) {
			super();

			init(
				this,
				options,
				instance$a,
				create_fragment$a,
				safe_not_equal,
				{
					custom: 6,
					localizationLayout: 7,
					layout: 8,
					noSwap: 9,
					keyClass: 0
				},
				null,
				[-1, -1]
			);
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

	function checkMobile() {
		const devices = {
			android: () => navigator.userAgent.match(/Android/i),

			blackberry: () => navigator.userAgent.match(/BlackBerry/i),

			ios: () => navigator.userAgent.match(/iPhone|iPad|iPod/i),

			opera: () => navigator.userAgent.match(/Opera Mini/i),

			windows: () => navigator.userAgent.match(/IEMobile/i),
		};

		return devices.android() ||
			devices.blackberry() ||
			devices.ios() ||
			devices.opera() ||
			devices.windows();
	}

	/* ../src/Cell.svelte generated by Svelte v4.2.20 */

	function create_if_block_1$2(ctx) {
		let line;

		return {
			c() {
				line = svg_element("line");
				this.h();
			},
			l(nodes) {
				line = claim_svg_element(nodes, "line", {
					x1: true,
					y1: true,
					x2: true,
					y2: true,
					class: true
				});

				children(line).forEach(detach);
				this.h();
			},
			h() {
				attr(line, "x1", "0");
				attr(line, "y1", "1");
				attr(line, "x2", "1");
				attr(line, "y2", "0");
				attr(line, "class", "svelte-1veput");
			},
			m(target, anchor) {
				insert_hydration(target, line, anchor);
			},
			d(detaching) {
				if (detaching) {
					detach(line);
				}
			}
		};
	}

	// (164:2) {#if value}
	function create_if_block$3(ctx) {
		let text_1;
		let t;
		let text_1_transition;
		let current;

		return {
			c() {
				text_1 = svg_element("text");
				t = text(/*value*/ ctx[2]);
				this.h();
			},
			l(nodes) {
				text_1 = claim_svg_element(nodes, "text", {
					class: true,
					x: true,
					y: true,
					"text-anchor": true
				});

				var text_1_nodes = children(text_1);
				t = claim_text(text_1_nodes, /*value*/ ctx[2]);
				text_1_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(text_1, "class", "value svelte-1veput");
				attr(text_1, "x", "0.5");
				attr(text_1, "y", "0.9");
				attr(text_1, "text-anchor", "middle");
			},
			m(target, anchor) {
				insert_hydration(target, text_1, anchor);
				append_hydration(text_1, t);
				current = true;
			},
			p(new_ctx, dirty) {
				ctx = new_ctx;
				if (!current || dirty & /*value*/ 4) set_data(t, /*value*/ ctx[2]);
			},
			i(local) {
				if (current) return;

				if (local) {
					add_render_callback(() => {
						if (!current) return;

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
				}

				current = true;
			},
			o(local) {
				if (local) {
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
				}

				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(text_1);
				}

				if (detaching && text_1_transition) text_1_transition.end();
			}
		};
	}

	function create_fragment$9(ctx) {
		let g;
		let rect;
		let if_block0_anchor;
		let text_1;
		let t;
		let g_class_value;
		let g_transform_value;
		let mounted;
		let dispose;
		let if_block0 = /*showCheck*/ ctx[10] && !/*correct*/ ctx[11] && create_if_block_1$2();
		let if_block1 = /*value*/ ctx[2] && create_if_block$3(ctx);

		return {
			c() {
				g = svg_element("g");
				rect = svg_element("rect");
				if (if_block0) if_block0.c();
				if_block0_anchor = empty();
				if (if_block1) if_block1.c();
				text_1 = svg_element("text");
				t = text(/*number*/ ctx[3]);
				this.h();
			},
			l(nodes) {
				g = claim_svg_element(nodes, "g", {
					class: true,
					transform: true,
					role: true,
					tabindex: true
				});

				var g_nodes = children(g);
				rect = claim_svg_element(g_nodes, "rect", { width: true, height: true, class: true });
				children(rect).forEach(detach);
				if (if_block0) if_block0.l(g_nodes);
				if_block0_anchor = empty();
				if (if_block1) if_block1.l(g_nodes);

				text_1 = claim_svg_element(g_nodes, "text", {
					class: true,
					x: true,
					y: true,
					"text-anchor": true
				});

				var text_1_nodes = children(text_1);
				t = claim_text(text_1_nodes, /*number*/ ctx[3]);
				text_1_nodes.forEach(detach);
				g_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(rect, "width", "1");
				attr(rect, "height", "1");
				attr(rect, "class", "svelte-1veput");
				attr(text_1, "class", "number svelte-1veput");
				attr(text_1, "x", "0.08");
				attr(text_1, "y", "0.3");
				attr(text_1, "text-anchor", "start");
				attr(g, "class", g_class_value = "cell " + /*custom*/ ctx[4] + " cell-" + /*x*/ ctx[0] + "-" + /*y*/ ctx[1] + " svelte-1veput");
				attr(g, "transform", g_transform_value = `translate(${/*x*/ ctx[0]}, ${/*y*/ ctx[1]})`);
				attr(g, "role", "button");
				attr(g, "tabindex", "0");
				toggle_class(g, "is-focused", /*isFocused*/ ctx[7]);
				toggle_class(g, "is-secondarily-focused", /*isSecondarilyFocused*/ ctx[8]);
				toggle_class(g, "is-correct", /*showCheck*/ ctx[10] && /*correct*/ ctx[11]);
				toggle_class(g, "is-incorrect", /*showCheck*/ ctx[10] && !/*correct*/ ctx[11]);
			},
			m(target, anchor) {
				insert_hydration(target, g, anchor);
				append_hydration(g, rect);
				if (if_block0) if_block0.m(g, null);
				append_hydration(g, if_block0_anchor);
				if (if_block1) if_block1.m(g, null);
				append_hydration(g, text_1);
				append_hydration(text_1, t);
				/*g_binding*/ ctx[23](g);

				if (!mounted) {
					dispose = [
						listen(g, "click", /*onClick*/ ctx[13]),
						listen(g, "keydown", /*onKeydown*/ ctx[12])
					];

					mounted = true;
				}
			},
			p(ctx, [dirty]) {
				if (/*showCheck*/ ctx[10] && !/*correct*/ ctx[11]) {
					if (if_block0) ; else {
						if_block0 = create_if_block_1$2();
						if_block0.c();
						if_block0.m(g, if_block0_anchor);
					}
				} else if (if_block0) {
					if_block0.d(1);
					if_block0 = null;
				}

				if (/*value*/ ctx[2]) {
					if (if_block1) {
						if_block1.p(ctx, dirty);

						if (dirty & /*value*/ 4) {
							transition_in(if_block1, 1);
						}
					} else {
						if_block1 = create_if_block$3(ctx);
						if_block1.c();
						transition_in(if_block1, 1);
						if_block1.m(g, text_1);
					}
				} else if (if_block1) {
					group_outros();

					transition_out(if_block1, 1, 1, () => {
						if_block1 = null;
					});

					check_outros();
				}

				if (dirty & /*number*/ 8) set_data(t, /*number*/ ctx[3]);

				if (dirty & /*custom, x, y*/ 19 && g_class_value !== (g_class_value = "cell " + /*custom*/ ctx[4] + " cell-" + /*x*/ ctx[0] + "-" + /*y*/ ctx[1] + " svelte-1veput")) {
					attr(g, "class", g_class_value);
				}

				if (dirty & /*x, y*/ 3 && g_transform_value !== (g_transform_value = `translate(${/*x*/ ctx[0]}, ${/*y*/ ctx[1]})`)) {
					attr(g, "transform", g_transform_value);
				}

				if (dirty & /*custom, x, y, isFocused*/ 147) {
					toggle_class(g, "is-focused", /*isFocused*/ ctx[7]);
				}

				if (dirty & /*custom, x, y, isSecondarilyFocused*/ 275) {
					toggle_class(g, "is-secondarily-focused", /*isSecondarilyFocused*/ ctx[8]);
				}

				if (dirty & /*custom, x, y, showCheck, correct*/ 3091) {
					toggle_class(g, "is-correct", /*showCheck*/ ctx[10] && /*correct*/ ctx[11]);
				}

				if (dirty & /*custom, x, y, showCheck, correct*/ 3091) {
					toggle_class(g, "is-incorrect", /*showCheck*/ ctx[10] && !/*correct*/ ctx[11]);
				}
			},
			i(local) {
				transition_in(if_block1);
			},
			o(local) {
				transition_out(if_block1);
			},
			d(detaching) {
				if (detaching) {
					detach(g);
				}

				if (if_block0) if_block0.d();
				if (if_block1) if_block1.d();
				/*g_binding*/ ctx[23](null);
				mounted = false;
				run_all(dispose);
			}
		};
	}

	function checkCleanLetter(checkingLetter, answerLetter) {
		let cleanedLetter = answerLetter;

		switch (answerLetter) {
			case "Ç":
				cleanedLetter = "C";
				break;
			case "Á":
			case "À":
			case "Â":
			case "Ã":
			case "Ä":
				cleanedLetter = "A";
				break;
			case "É":
			case "È":
			case "Ê":
				cleanedLetter = "E";
				break;
			case "Í":
			case "Ì":
			case "Î":
				cleanedLetter = "I";
				break;
			case "Ó":
			case "Ò":
			case "Ô":
			case "Õ":
			case "Ö":
				cleanedLetter = "O";
				break;
			case "Ú":
			case "Ù":
			case "Ü":
			case "Û":
				cleanedLetter = "U";
				break;
			case "Ñ":
				cleanedLetter = "N";
				break;
		}

		return cleanedLetter === checkingLetter;
	}

	function pop(node, { delay = 0, duration = 250 }) {
		return {
			delay,
			duration,
			css: t => [`transform: translate(0, ${1 - t}px)`].join(
				";"
			)
		};
	}

	function instance$9($$self, $$props, $$invalidate) {
		let correct;
		let showCheck;
		let { x } = $$props;
		let { y } = $$props;
		let { value } = $$props;
		let { answer } = $$props;
		let { number } = $$props;
		let { index } = $$props;
		let { custom } = $$props;
		let { changeDelay = 0 } = $$props;
		let { isRevealing = false } = $$props;
		let { isChecking = false } = $$props;
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
				onCellUpdate(index, "", -1, true);
				return;
			}

			const isKeyInAlphabet = (/^[a-zA-ZáàâãéèêíïóôõöúçñÁÀÂÃÉÈÍÏÓÔÕÖÚÇÑ']$/).test(e.key);
			const key = e.key.toUpperCase();

			if (isKeyInAlphabet) {
				onCellUpdate(index, checkCleanLetter(key, answer) ? answer : key);
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

		function g_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				element = $$value;
				$$invalidate(9, element);
			});
		}

		$$self.$$set = $$props => {
			if ('x' in $$props) $$invalidate(0, x = $$props.x);
			if ('y' in $$props) $$invalidate(1, y = $$props.y);
			if ('value' in $$props) $$invalidate(2, value = $$props.value);
			if ('answer' in $$props) $$invalidate(14, answer = $$props.answer);
			if ('number' in $$props) $$invalidate(3, number = $$props.number);
			if ('index' in $$props) $$invalidate(15, index = $$props.index);
			if ('custom' in $$props) $$invalidate(4, custom = $$props.custom);
			if ('changeDelay' in $$props) $$invalidate(5, changeDelay = $$props.changeDelay);
			if ('isRevealing' in $$props) $$invalidate(6, isRevealing = $$props.isRevealing);
			if ('isChecking' in $$props) $$invalidate(16, isChecking = $$props.isChecking);
			if ('isFocused' in $$props) $$invalidate(7, isFocused = $$props.isFocused);
			if ('isSecondarilyFocused' in $$props) $$invalidate(8, isSecondarilyFocused = $$props.isSecondarilyFocused);
			if ('onFocusCell' in $$props) $$invalidate(17, onFocusCell = $$props.onFocusCell);
			if ('onCellUpdate' in $$props) $$invalidate(18, onCellUpdate = $$props.onCellUpdate);
			if ('onFocusClueDiff' in $$props) $$invalidate(19, onFocusClueDiff = $$props.onFocusClueDiff);
			if ('onMoveFocus' in $$props) $$invalidate(20, onMoveFocus = $$props.onMoveFocus);
			if ('onFlipDirection' in $$props) $$invalidate(21, onFlipDirection = $$props.onFlipDirection);
			if ('onHistoricalChange' in $$props) $$invalidate(22, onHistoricalChange = $$props.onHistoricalChange);
		};

		$$self.$$.update = () => {
			if ($$self.$$.dirty & /*isFocused*/ 128) {
				(onFocusSelf());
			}

			if ($$self.$$.dirty & /*answer, value*/ 16388) {
				$$invalidate(11, correct = answer === value);
			}

			if ($$self.$$.dirty & /*isChecking, value*/ 65540) {
				$$invalidate(10, showCheck = isChecking && value);
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
			showCheck,
			correct,
			onKeydown,
			onClick,
			answer,
			index,
			isChecking,
			onFocusCell,
			onCellUpdate,
			onFocusClueDiff,
			onMoveFocus,
			onFlipDirection,
			onHistoricalChange,
			g_binding
		];
	}

	class Cell extends SvelteComponent {
		constructor(options) {
			super();

			init(this, options, instance$9, create_fragment$9, safe_not_equal, {
				x: 0,
				y: 1,
				value: 2,
				answer: 14,
				number: 3,
				index: 15,
				custom: 4,
				changeDelay: 5,
				isRevealing: 6,
				isChecking: 16,
				isFocused: 7,
				isSecondarilyFocused: 8,
				onFocusCell: 17,
				onCellUpdate: 18,
				onFocusClueDiff: 19,
				onMoveFocus: 20,
				onFlipDirection: 21,
				onHistoricalChange: 22
			});
		}
	}

	/* ../src/Puzzle.svelte generated by Svelte v4.2.20 */

	function get_each_context$3(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[36] = list[i].x;
		child_ctx[37] = list[i].y;
		child_ctx[38] = list[i].value;
		child_ctx[39] = list[i].answer;
		child_ctx[40] = list[i].index;
		child_ctx[41] = list[i].number;
		child_ctx[42] = list[i].custom;
		return child_ctx;
	}

	// (200:4) {#each cells as { x, y, value, answer, index, number, custom }}
	function create_each_block$3(ctx) {
		let cell;
		let current;

		cell = new Cell({
				props: {
					x: /*x*/ ctx[36],
					y: /*y*/ ctx[37],
					index: /*index*/ ctx[40],
					value: /*value*/ ctx[38],
					answer: /*answer*/ ctx[39],
					number: /*number*/ ctx[41],
					custom: /*custom*/ ctx[42],
					changeDelay: /*isRevealing*/ ctx[2]
					? /*revealDuration*/ ctx[6] / /*cells*/ ctx[0].length * /*index*/ ctx[40]
					: 0,
					isRevealing: /*isRevealing*/ ctx[2],
					isChecking: /*isChecking*/ ctx[3],
					isFocused: /*focusedCellIndex*/ ctx[1] == /*index*/ ctx[40] && !/*isDisableHighlight*/ ctx[4],
					isSecondarilyFocused: /*secondarilyFocusedCells*/ ctx[10].includes(/*index*/ ctx[40]) && !/*isDisableHighlight*/ ctx[4],
					onFocusCell: /*onFocusCell*/ ctx[16],
					onCellUpdate: /*onCellUpdate*/ ctx[14],
					onFocusClueDiff: /*onFocusClueDiff*/ ctx[17],
					onMoveFocus: /*onMoveFocus*/ ctx[18],
					onFlipDirection: /*onFlipDirection*/ ctx[19],
					onHistoricalChange: /*onHistoricalChange*/ ctx[15]
				}
			});

		return {
			c() {
				create_component(cell.$$.fragment);
			},
			l(nodes) {
				claim_component(cell.$$.fragment, nodes);
			},
			m(target, anchor) {
				mount_component(cell, target, anchor);
				current = true;
			},
			p(ctx, dirty) {
				const cell_changes = {};
				if (dirty[0] & /*cells*/ 1) cell_changes.x = /*x*/ ctx[36];
				if (dirty[0] & /*cells*/ 1) cell_changes.y = /*y*/ ctx[37];
				if (dirty[0] & /*cells*/ 1) cell_changes.index = /*index*/ ctx[40];
				if (dirty[0] & /*cells*/ 1) cell_changes.value = /*value*/ ctx[38];
				if (dirty[0] & /*cells*/ 1) cell_changes.answer = /*answer*/ ctx[39];
				if (dirty[0] & /*cells*/ 1) cell_changes.number = /*number*/ ctx[41];
				if (dirty[0] & /*cells*/ 1) cell_changes.custom = /*custom*/ ctx[42];

				if (dirty[0] & /*isRevealing, revealDuration, cells*/ 69) cell_changes.changeDelay = /*isRevealing*/ ctx[2]
				? /*revealDuration*/ ctx[6] / /*cells*/ ctx[0].length * /*index*/ ctx[40]
				: 0;

				if (dirty[0] & /*isRevealing*/ 4) cell_changes.isRevealing = /*isRevealing*/ ctx[2];
				if (dirty[0] & /*isChecking*/ 8) cell_changes.isChecking = /*isChecking*/ ctx[3];
				if (dirty[0] & /*focusedCellIndex, cells, isDisableHighlight*/ 19) cell_changes.isFocused = /*focusedCellIndex*/ ctx[1] == /*index*/ ctx[40] && !/*isDisableHighlight*/ ctx[4];
				if (dirty[0] & /*secondarilyFocusedCells, cells, isDisableHighlight*/ 1041) cell_changes.isSecondarilyFocused = /*secondarilyFocusedCells*/ ctx[10].includes(/*index*/ ctx[40]) && !/*isDisableHighlight*/ ctx[4];
				cell.$set(cell_changes);
			},
			i(local) {
				if (current) return;
				transition_in(cell.$$.fragment, local);
				current = true;
			},
			o(local) {
				transition_out(cell.$$.fragment, local);
				current = false;
			},
			d(detaching) {
				destroy_component(cell, detaching);
			}
		};
	}

	// (228:0) {#if keyboardVisible}
	function create_if_block$2(ctx) {
		let div;
		let keyboard;
		let current;

		keyboard = new Keyboard({
				props: {
					layout: "crossword",
					style: /*keyboardStyle*/ ctx[8]
				}
			});

		keyboard.$on("keydown", /*onKeydown*/ ctx[20]);

		return {
			c() {
				div = element("div");
				create_component(keyboard.$$.fragment);
				this.h();
			},
			l(nodes) {
				div = claim_element(nodes, "DIV", { class: true });
				var div_nodes = children(div);
				claim_component(keyboard.$$.fragment, div_nodes);
				div_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(div, "class", "keyboard svelte-ce6hth");
			},
			m(target, anchor) {
				insert_hydration(target, div, anchor);
				mount_component(keyboard, div, null);
				current = true;
			},
			p(ctx, dirty) {
				const keyboard_changes = {};
				if (dirty[0] & /*keyboardStyle*/ 256) keyboard_changes.style = /*keyboardStyle*/ ctx[8];
				keyboard.$set(keyboard_changes);
			},
			i(local) {
				if (current) return;
				transition_in(keyboard.$$.fragment, local);
				current = true;
			},
			o(local) {
				transition_out(keyboard.$$.fragment, local);
				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				destroy_component(keyboard);
			}
		};
	}

	function create_fragment$8(ctx) {
		let section;
		let svg;
		let svg_viewBox_value;
		let t;
		let if_block_anchor;
		let current;
		let mounted;
		let dispose;
		let each_value = ensure_array_like(/*cells*/ ctx[0]);
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
		}

		const out = i => transition_out(each_blocks[i], 1, 1, () => {
			each_blocks[i] = null;
		});

		let if_block = /*keyboardVisible*/ ctx[11] && create_if_block$2(ctx);

		return {
			c() {
				section = element("section");
				svg = svg_element("svg");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				t = space();
				if (if_block) if_block.c();
				if_block_anchor = empty();
				this.h();
			},
			l(nodes) {
				section = claim_element(nodes, "SECTION", { class: true });
				var section_nodes = children(section);
				svg = claim_svg_element(section_nodes, "svg", { viewBox: true, class: true });
				var svg_nodes = children(svg);

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].l(svg_nodes);
				}

				svg_nodes.forEach(detach);
				section_nodes.forEach(detach);
				t = claim_space(nodes);
				if (if_block) if_block.l(nodes);
				if_block_anchor = empty();
				this.h();
			},
			h() {
				attr(svg, "viewBox", svg_viewBox_value = "0 0 " + /*w*/ ctx[13] + " " + /*h*/ ctx[12]);
				attr(svg, "class", "svelte-ce6hth");
				attr(section, "class", "puzzle svelte-ce6hth");
				toggle_class(section, "stacked", /*stacked*/ ctx[5]);
				toggle_class(section, "is-loaded", /*isLoaded*/ ctx[7]);
			},
			m(target, anchor) {
				insert_hydration(target, section, anchor);
				append_hydration(section, svg);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(svg, null);
					}
				}

				/*section_binding*/ ctx[27](section);
				insert_hydration(target, t, anchor);
				if (if_block) if_block.m(target, anchor);
				insert_hydration(target, if_block_anchor, anchor);
				current = true;

				if (!mounted) {
					dispose = listen(window, "click", /*onClick*/ ctx[21]);
					mounted = true;
				}
			},
			p(ctx, dirty) {
				if (dirty[0] & /*cells, isRevealing, revealDuration, isChecking, focusedCellIndex, isDisableHighlight, secondarilyFocusedCells, onFocusCell, onCellUpdate, onFocusClueDiff, onMoveFocus, onFlipDirection, onHistoricalChange*/ 1033311) {
					each_value = ensure_array_like(/*cells*/ ctx[0]);
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
							each_blocks[i].m(svg, null);
						}
					}

					group_outros();

					for (i = each_value.length; i < each_blocks.length; i += 1) {
						out(i);
					}

					check_outros();
				}

				if (!current || dirty[0] & /*w, h*/ 12288 && svg_viewBox_value !== (svg_viewBox_value = "0 0 " + /*w*/ ctx[13] + " " + /*h*/ ctx[12])) {
					attr(svg, "viewBox", svg_viewBox_value);
				}

				if (!current || dirty[0] & /*stacked*/ 32) {
					toggle_class(section, "stacked", /*stacked*/ ctx[5]);
				}

				if (!current || dirty[0] & /*isLoaded*/ 128) {
					toggle_class(section, "is-loaded", /*isLoaded*/ ctx[7]);
				}

				if (/*keyboardVisible*/ ctx[11]) {
					if (if_block) {
						if_block.p(ctx, dirty);

						if (dirty[0] & /*keyboardVisible*/ 2048) {
							transition_in(if_block, 1);
						}
					} else {
						if_block = create_if_block$2(ctx);
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
			i(local) {
				if (current) return;

				for (let i = 0; i < each_value.length; i += 1) {
					transition_in(each_blocks[i]);
				}

				transition_in(if_block);
				current = true;
			},
			o(local) {
				each_blocks = each_blocks.filter(Boolean);

				for (let i = 0; i < each_blocks.length; i += 1) {
					transition_out(each_blocks[i]);
				}

				transition_out(if_block);
				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(section);
					detach(t);
					detach(if_block_anchor);
				}

				destroy_each(each_blocks, detaching);
				/*section_binding*/ ctx[27](null);
				if (if_block) if_block.d(detaching);
				mounted = false;
				dispose();
			}
		};
	}

	const numberOfStatesInHistory = 10;

	function instance$8($$self, $$props, $$invalidate) {
		let w;
		let h;
		let keyboardVisible;
		let sortedCellsInDirection;
		let { clues } = $$props;
		let { cells } = $$props;
		let { focusedDirection } = $$props;
		let { focusedCellIndex } = $$props;
		let { focusedCell } = $$props;
		let { isRevealing } = $$props;
		let { isChecking } = $$props;
		let { isDisableHighlight } = $$props;
		let { stacked } = $$props;
		let { revealDuration = 0 } = $$props;
		let { showKeyboard } = $$props;
		let { isLoaded } = $$props;
		let { keyboardStyle } = $$props;
		let element;
		let cellsHistoryIndex = 0;
		let cellsHistory = [];
		let focusedCellIndexHistory = [];
		let secondarilyFocusedCells = [];
		let isMobile = false;
		let isPuzzleFocused = false;

		onMount(() => {
			$$invalidate(26, isMobile = checkMobile());
		});

		function updateSecondarilyFocusedCells() {
			$$invalidate(10, secondarilyFocusedCells = getSecondarilyFocusedCells({ cells, focusedDirection, focusedCell }));
		}

		function onCellUpdate(index, newValue, diff = 1, doReplaceFilledCells) {
			doReplaceFilledCells = doReplaceFilledCells || !!cells[index].value;
			const dimension = focusedDirection == "across" ? "x" : "y";
			const clueIndex = cells[index].clueNumbers[focusedDirection];
			const cellsInClue = cells.filter(cell => cell.clueNumbers[focusedDirection] == clueIndex && (doReplaceFilledCells || !cell.value));
			const cellsInCluePositions = cellsInClue.map(cell => cell[dimension]).filter(Number.isFinite);
			const isAtEndOfClue = cells[index][dimension] == Math.max(...cellsInCluePositions);

			const newCells = [
				...cells.slice(0, index),
				{ ...cells[index], value: newValue },
				...cells.slice(index + 1)
			];

			cellsHistory = [newCells, ...cellsHistory.slice(cellsHistoryIndex)].slice(0, numberOfStatesInHistory);
			cellsHistoryIndex = 0;
			$$invalidate(0, cells = newCells);

			if (isAtEndOfClue && diff > 0) {
				onFocusClueDiff(diff);
			} else {
				onFocusCellDiff(diff, doReplaceFilledCells);
			}
		}

		function onHistoricalChange(diff) {
			cellsHistoryIndex += -diff;
			$$invalidate(0, cells = cellsHistory[cellsHistoryIndex] || cells);
			$$invalidate(1, focusedCellIndex = focusedCellIndexHistory[cellsHistoryIndex] || focusedCellIndex);
		}

		function onFocusCell(index) {
			if (isPuzzleFocused && index == focusedCellIndex) {
				onFlipDirection();
			} else {
				$$invalidate(1, focusedCellIndex = index);

				if (!cells[focusedCellIndex].clueNumbers[focusedDirection]) {
					const newDirection = focusedDirection === "across" ? "down" : "across";
					$$invalidate(22, focusedDirection = newDirection);
				}

				focusedCellIndexHistory = [index, ...focusedCellIndexHistory.slice(0, numberOfStatesInHistory)];
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

			let nextCluesInDirection = clues.filter(clue => !clue.isFilled && (diff > 0
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

			const nextFocusedCell = sortedCellsInDirection.find(cell => !cell.value && cell.clueNumbers[focusedDirection] == nextClue.number) || {};
			$$invalidate(1, focusedCellIndex = nextFocusedCell.index || 0);
		}

		function onMoveFocus(direction, diff) {
			if (focusedDirection != direction) {
				$$invalidate(22, focusedDirection = direction);
			} else {
				const nextCell = getCellAfterDiff({ diff, cells, direction, focusedCell });
				if (!nextCell) return;
				onFocusCell(nextCell.index);
			}
		}

		function onFlipDirection() {
			const newDirection = focusedDirection === "across" ? "down" : "across";
			const hasClueInNewDirection = !!focusedCell["clueNumbers"][newDirection];
			if (hasClueInNewDirection) $$invalidate(22, focusedDirection = newDirection);
		}

		function onKeydown({ detail }) {
			const diff = detail === "Backspace" ? -1 : 1;
			const value = detail === "Backspace" ? "" : detail;
			onCellUpdate(focusedCellIndex, value, diff);
		}

		function onClick() {
			isPuzzleFocused = element.contains(document.activeElement);
		}

		function section_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				element = $$value;
				$$invalidate(9, element);
			});
		}

		$$self.$$set = $$props => {
			if ('clues' in $$props) $$invalidate(23, clues = $$props.clues);
			if ('cells' in $$props) $$invalidate(0, cells = $$props.cells);
			if ('focusedDirection' in $$props) $$invalidate(22, focusedDirection = $$props.focusedDirection);
			if ('focusedCellIndex' in $$props) $$invalidate(1, focusedCellIndex = $$props.focusedCellIndex);
			if ('focusedCell' in $$props) $$invalidate(24, focusedCell = $$props.focusedCell);
			if ('isRevealing' in $$props) $$invalidate(2, isRevealing = $$props.isRevealing);
			if ('isChecking' in $$props) $$invalidate(3, isChecking = $$props.isChecking);
			if ('isDisableHighlight' in $$props) $$invalidate(4, isDisableHighlight = $$props.isDisableHighlight);
			if ('stacked' in $$props) $$invalidate(5, stacked = $$props.stacked);
			if ('revealDuration' in $$props) $$invalidate(6, revealDuration = $$props.revealDuration);
			if ('showKeyboard' in $$props) $$invalidate(25, showKeyboard = $$props.showKeyboard);
			if ('isLoaded' in $$props) $$invalidate(7, isLoaded = $$props.isLoaded);
			if ('keyboardStyle' in $$props) $$invalidate(8, keyboardStyle = $$props.keyboardStyle);
		};

		$$self.$$.update = () => {
			if ($$self.$$.dirty[0] & /*cells*/ 1) {
				$$invalidate(13, w = Math.max(...cells.map(d => d.x)) + 1);
			}

			if ($$self.$$.dirty[0] & /*cells*/ 1) {
				$$invalidate(12, h = Math.max(...cells.map(d => d.y)) + 1);
			}

			if ($$self.$$.dirty[0] & /*showKeyboard, isMobile*/ 100663296) {
				$$invalidate(11, keyboardVisible = typeof showKeyboard === "boolean"
				? showKeyboard
				: isMobile);
			}

			if ($$self.$$.dirty[0] & /*cells, focusedCellIndex, focusedDirection*/ 4194307) {
				(updateSecondarilyFocusedCells());
			}

			if ($$self.$$.dirty[0] & /*cells, focusedDirection*/ 4194305) {
				sortedCellsInDirection = [...cells].sort((a, b) => focusedDirection == "down"
				? a.x - b.x || a.y - b.y
				: a.y - b.y || a.x - b.x);
			}
		};

		return [
			cells,
			focusedCellIndex,
			isRevealing,
			isChecking,
			isDisableHighlight,
			stacked,
			revealDuration,
			isLoaded,
			keyboardStyle,
			element,
			secondarilyFocusedCells,
			keyboardVisible,
			h,
			w,
			onCellUpdate,
			onHistoricalChange,
			onFocusCell,
			onFocusClueDiff,
			onMoveFocus,
			onFlipDirection,
			onKeydown,
			onClick,
			focusedDirection,
			clues,
			focusedCell,
			showKeyboard,
			isMobile,
			section_binding
		];
	}

	class Puzzle extends SvelteComponent {
		constructor(options) {
			super();

			init(
				this,
				options,
				instance$8,
				create_fragment$8,
				safe_not_equal,
				{
					clues: 23,
					cells: 0,
					focusedDirection: 22,
					focusedCellIndex: 1,
					focusedCell: 24,
					isRevealing: 2,
					isChecking: 3,
					isDisableHighlight: 4,
					stacked: 5,
					revealDuration: 6,
					showKeyboard: 25,
					isLoaded: 7,
					keyboardStyle: 8
				},
				null,
				[-1, -1]
			);
		}
	}

	function scrollTO (node, isFocused) {
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
	}

	/* ../src/Clue.svelte generated by Svelte v4.2.20 */

	function create_fragment$7(ctx) {
		let li;
		let button;
		let strong;
		let t0;
		let t1;
		let t2;
		let button_class_value;
		let scrollTo_action;
		let mounted;
		let dispose;

		return {
			c() {
				li = element("li");
				button = element("button");
				strong = element("strong");
				t0 = text(/*number*/ ctx[0]);
				t1 = space();
				t2 = text(/*clue*/ ctx[1]);
				this.h();
			},
			l(nodes) {
				li = claim_element(nodes, "LI", {});
				var li_nodes = children(li);
				button = claim_element(li_nodes, "BUTTON", { class: true });
				var button_nodes = children(button);
				strong = claim_element(button_nodes, "STRONG", { class: true });
				var strong_nodes = children(strong);
				t0 = claim_text(strong_nodes, /*number*/ ctx[0]);
				strong_nodes.forEach(detach);
				t1 = claim_space(button_nodes);
				t2 = claim_text(button_nodes, /*clue*/ ctx[1]);
				button_nodes.forEach(detach);
				li_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(strong, "class", "svelte-hozmon");
				attr(button, "class", button_class_value = "clue " + /*custom*/ ctx[2] + " svelte-hozmon");
				toggle_class(button, "is-disable-highlight", /*isDisableHighlight*/ ctx[6]);
				toggle_class(button, "is-number-focused", /*isNumberFocused*/ ctx[4]);
				toggle_class(button, "is-direction-focused", /*isDirectionFocused*/ ctx[5]);
				toggle_class(button, "is-filled", /*isFilled*/ ctx[3]);
			},
			m(target, anchor) {
				insert_hydration(target, li, anchor);
				append_hydration(li, button);
				append_hydration(button, strong);
				append_hydration(strong, t0);
				append_hydration(button, t1);
				append_hydration(button, t2);
				/*li_binding*/ ctx[10](li);

				if (!mounted) {
					dispose = [
						listen(button, "click", function () {
							if (is_function(/*onFocus*/ ctx[7])) /*onFocus*/ ctx[7].apply(this, arguments);
						}),
						action_destroyer(scrollTo_action = scrollTO.call(null, li, /*isFocused*/ ctx[9]))
					];

					mounted = true;
				}
			},
			p(new_ctx, [dirty]) {
				ctx = new_ctx;
				if (dirty & /*number*/ 1) set_data(t0, /*number*/ ctx[0]);
				if (dirty & /*clue*/ 2) set_data(t2, /*clue*/ ctx[1]);

				if (dirty & /*custom*/ 4 && button_class_value !== (button_class_value = "clue " + /*custom*/ ctx[2] + " svelte-hozmon")) {
					attr(button, "class", button_class_value);
				}

				if (dirty & /*custom, isDisableHighlight*/ 68) {
					toggle_class(button, "is-disable-highlight", /*isDisableHighlight*/ ctx[6]);
				}

				if (dirty & /*custom, isNumberFocused*/ 20) {
					toggle_class(button, "is-number-focused", /*isNumberFocused*/ ctx[4]);
				}

				if (dirty & /*custom, isDirectionFocused*/ 36) {
					toggle_class(button, "is-direction-focused", /*isDirectionFocused*/ ctx[5]);
				}

				if (dirty & /*custom, isFilled*/ 12) {
					toggle_class(button, "is-filled", /*isFilled*/ ctx[3]);
				}

				if (scrollTo_action && is_function(scrollTo_action.update) && dirty & /*isFocused*/ 512) scrollTo_action.update.call(null, /*isFocused*/ ctx[9]);
			},
			i: noop,
			o: noop,
			d(detaching) {
				if (detaching) {
					detach(li);
				}

				/*li_binding*/ ctx[10](null);
				mounted = false;
				run_all(dispose);
			}
		};
	}

	function instance$7($$self, $$props, $$invalidate) {
		let isFocused;
		let { number } = $$props;
		let { clue } = $$props;
		let { custom } = $$props;
		let { isFilled } = $$props;
		let { isNumberFocused = false } = $$props;
		let { isDirectionFocused = false } = $$props;
		let { isDisableHighlight = false } = $$props;

		let { onFocus = () => {
			
		} } = $$props;

		let element;

		function li_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				element = $$value;
				$$invalidate(8, element);
			});
		}

		$$self.$$set = $$props => {
			if ('number' in $$props) $$invalidate(0, number = $$props.number);
			if ('clue' in $$props) $$invalidate(1, clue = $$props.clue);
			if ('custom' in $$props) $$invalidate(2, custom = $$props.custom);
			if ('isFilled' in $$props) $$invalidate(3, isFilled = $$props.isFilled);
			if ('isNumberFocused' in $$props) $$invalidate(4, isNumberFocused = $$props.isNumberFocused);
			if ('isDirectionFocused' in $$props) $$invalidate(5, isDirectionFocused = $$props.isDirectionFocused);
			if ('isDisableHighlight' in $$props) $$invalidate(6, isDisableHighlight = $$props.isDisableHighlight);
			if ('onFocus' in $$props) $$invalidate(7, onFocus = $$props.onFocus);
		};

		$$self.$$.update = () => {
			if ($$self.$$.dirty & /*isNumberFocused*/ 16) {
				$$invalidate(9, isFocused = isNumberFocused);
			}
		};

		return [
			number,
			clue,
			custom,
			isFilled,
			isNumberFocused,
			isDirectionFocused,
			isDisableHighlight,
			onFocus,
			element,
			isFocused,
			li_binding
		];
	}

	class Clue extends SvelteComponent {
		constructor(options) {
			super();

			init(this, options, instance$7, create_fragment$7, safe_not_equal, {
				number: 0,
				clue: 1,
				custom: 2,
				isFilled: 3,
				isNumberFocused: 4,
				isDirectionFocused: 5,
				isDisableHighlight: 6,
				onFocus: 7
			});
		}
	}

	/* ../src/ClueList.svelte generated by Svelte v4.2.20 */

	function get_each_context$2(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[7] = list[i];
		return child_ctx;
	}

	// (15:4) {#each clues as clue}
	function create_each_block$2(ctx) {
		let clue_1;
		let current;

		function func() {
			return /*func*/ ctx[6](/*clue*/ ctx[7]);
		}

		clue_1 = new Clue({
				props: {
					clue: /*clue*/ ctx[7].clue,
					number: /*clue*/ ctx[7].number,
					custom: /*clue*/ ctx[7].custom,
					isFilled: /*clue*/ ctx[7].isFilled,
					isNumberFocused: /*focusedClueNumbers*/ ctx[2][/*direction*/ ctx[0]] === /*clue*/ ctx[7].number,
					isDirectionFocused: /*isDirectionFocused*/ ctx[3],
					isDisableHighlight: /*isDisableHighlight*/ ctx[5],
					onFocus: func
				}
			});

		return {
			c() {
				create_component(clue_1.$$.fragment);
			},
			l(nodes) {
				claim_component(clue_1.$$.fragment, nodes);
			},
			m(target, anchor) {
				mount_component(clue_1, target, anchor);
				current = true;
			},
			p(new_ctx, dirty) {
				ctx = new_ctx;
				const clue_1_changes = {};
				if (dirty & /*clues*/ 2) clue_1_changes.clue = /*clue*/ ctx[7].clue;
				if (dirty & /*clues*/ 2) clue_1_changes.number = /*clue*/ ctx[7].number;
				if (dirty & /*clues*/ 2) clue_1_changes.custom = /*clue*/ ctx[7].custom;
				if (dirty & /*clues*/ 2) clue_1_changes.isFilled = /*clue*/ ctx[7].isFilled;
				if (dirty & /*focusedClueNumbers, direction, clues*/ 7) clue_1_changes.isNumberFocused = /*focusedClueNumbers*/ ctx[2][/*direction*/ ctx[0]] === /*clue*/ ctx[7].number;
				if (dirty & /*isDirectionFocused*/ 8) clue_1_changes.isDirectionFocused = /*isDirectionFocused*/ ctx[3];
				if (dirty & /*isDisableHighlight*/ 32) clue_1_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[5];
				if (dirty & /*onClueFocus, clues*/ 18) clue_1_changes.onFocus = func;
				clue_1.$set(clue_1_changes);
			},
			i(local) {
				if (current) return;
				transition_in(clue_1.$$.fragment, local);
				current = true;
			},
			o(local) {
				transition_out(clue_1.$$.fragment, local);
				current = false;
			},
			d(detaching) {
				destroy_component(clue_1, detaching);
			}
		};
	}

	function create_fragment$6(ctx) {
		let p;
		let t0;
		let t1;
		let div;
		let ul;
		let current;
		let each_value = ensure_array_like(/*clues*/ ctx[1]);
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
		}

		const out = i => transition_out(each_blocks[i], 1, 1, () => {
			each_blocks[i] = null;
		});

		return {
			c() {
				p = element("p");
				t0 = text(/*direction*/ ctx[0]);
				t1 = space();
				div = element("div");
				ul = element("ul");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				this.h();
			},
			l(nodes) {
				p = claim_element(nodes, "P", { class: true });
				var p_nodes = children(p);
				t0 = claim_text(p_nodes, /*direction*/ ctx[0]);
				p_nodes.forEach(detach);
				t1 = claim_space(nodes);
				div = claim_element(nodes, "DIV", { class: true });
				var div_nodes = children(div);
				ul = claim_element(div_nodes, "UL", { class: true });
				var ul_nodes = children(ul);

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].l(ul_nodes);
				}

				ul_nodes.forEach(detach);
				div_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(p, "class", "svelte-19kv288");
				attr(ul, "class", "svelte-19kv288");
				attr(div, "class", "list svelte-19kv288");
			},
			m(target, anchor) {
				insert_hydration(target, p, anchor);
				append_hydration(p, t0);
				insert_hydration(target, t1, anchor);
				insert_hydration(target, div, anchor);
				append_hydration(div, ul);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(ul, null);
					}
				}

				current = true;
			},
			p(ctx, [dirty]) {
				if (!current || dirty & /*direction*/ 1) set_data(t0, /*direction*/ ctx[0]);

				if (dirty & /*clues, focusedClueNumbers, direction, isDirectionFocused, isDisableHighlight, onClueFocus*/ 63) {
					each_value = ensure_array_like(/*clues*/ ctx[1]);
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
			i(local) {
				if (current) return;

				for (let i = 0; i < each_value.length; i += 1) {
					transition_in(each_blocks[i]);
				}

				current = true;
			},
			o(local) {
				each_blocks = each_blocks.filter(Boolean);

				for (let i = 0; i < each_blocks.length; i += 1) {
					transition_out(each_blocks[i]);
				}

				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(p);
					detach(t1);
					detach(div);
				}

				destroy_each(each_blocks, detaching);
			}
		};
	}

	function instance$6($$self, $$props, $$invalidate) {
		let { direction } = $$props;
		let { clues } = $$props;
		let { focusedClueNumbers } = $$props;
		let { isDirectionFocused } = $$props;
		let { onClueFocus } = $$props;
		let { isDisableHighlight } = $$props;
		const func = clue => onClueFocus(clue);

		$$self.$$set = $$props => {
			if ('direction' in $$props) $$invalidate(0, direction = $$props.direction);
			if ('clues' in $$props) $$invalidate(1, clues = $$props.clues);
			if ('focusedClueNumbers' in $$props) $$invalidate(2, focusedClueNumbers = $$props.focusedClueNumbers);
			if ('isDirectionFocused' in $$props) $$invalidate(3, isDirectionFocused = $$props.isDirectionFocused);
			if ('onClueFocus' in $$props) $$invalidate(4, onClueFocus = $$props.onClueFocus);
			if ('isDisableHighlight' in $$props) $$invalidate(5, isDisableHighlight = $$props.isDisableHighlight);
		};

		return [
			direction,
			clues,
			focusedClueNumbers,
			isDirectionFocused,
			onClueFocus,
			isDisableHighlight,
			func
		];
	}

	class ClueList extends SvelteComponent {
		constructor(options) {
			super();

			init(this, options, instance$6, create_fragment$6, safe_not_equal, {
				direction: 0,
				clues: 1,
				focusedClueNumbers: 2,
				isDirectionFocused: 3,
				onClueFocus: 4,
				isDisableHighlight: 5
			});
		}
	}

	/* ../src/ClueBar.svelte generated by Svelte v4.2.20 */

	function create_fragment$5(ctx) {
		let div;
		let button0;
		let textContent = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-left"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
		let t0;
		let p;
		let t1;
		let t2;
		let button1;
		let textContent_1 = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-right"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
		let div_class_value;
		let mounted;
		let dispose;

		return {
			c() {
				div = element("div");
				button0 = element("button");
				button0.innerHTML = textContent;
				t0 = space();
				p = element("p");
				t1 = text(/*clue*/ ctx[2]);
				t2 = space();
				button1 = element("button");
				button1.innerHTML = textContent_1;
				this.h();
			},
			l(nodes) {
				div = claim_element(nodes, "DIV", { class: true });
				var div_nodes = children(div);
				button0 = claim_element(div_nodes, "BUTTON", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(button0) !== "svelte-1ej1498") button0.innerHTML = textContent;
				t0 = claim_space(div_nodes);
				p = claim_element(div_nodes, "P", { class: true });
				var p_nodes = children(p);
				t1 = claim_text(p_nodes, /*clue*/ ctx[2]);
				p_nodes.forEach(detach);
				t2 = claim_space(div_nodes);
				button1 = claim_element(div_nodes, "BUTTON", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(button1) !== "svelte-10t1n6a") button1.innerHTML = textContent_1;
				div_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(button0, "class", "svelte-irjjhy");
				attr(p, "class", "svelte-irjjhy");
				attr(button1, "class", "svelte-irjjhy");
				attr(div, "class", div_class_value = "bar " + /*custom*/ ctx[1] + " svelte-irjjhy");
			},
			m(target, anchor) {
				insert_hydration(target, div, anchor);
				append_hydration(div, button0);
				append_hydration(div, t0);
				append_hydration(div, p);
				append_hydration(p, t1);
				append_hydration(div, t2);
				append_hydration(div, button1);

				if (!mounted) {
					dispose = [
						listen(button0, "click", /*click_handler*/ ctx[4]),
						listen(button1, "click", /*click_handler_1*/ ctx[5])
					];

					mounted = true;
				}
			},
			p(ctx, [dirty]) {
				if (dirty & /*clue*/ 4) set_data(t1, /*clue*/ ctx[2]);

				if (dirty & /*custom*/ 2 && div_class_value !== (div_class_value = "bar " + /*custom*/ ctx[1] + " svelte-irjjhy")) {
					attr(div, "class", div_class_value);
				}
			},
			i: noop,
			o: noop,
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				mounted = false;
				run_all(dispose);
			}
		};
	}

	function instance$5($$self, $$props, $$invalidate) {
		let clue;
		let custom;
		const dispatch = createEventDispatcher();
		let { currentClue = {} } = $$props;
		const click_handler = () => dispatch('nextClue', currentClue.index - 1);
		const click_handler_1 = () => dispatch('nextClue', currentClue.index + 1);

		$$self.$$set = $$props => {
			if ('currentClue' in $$props) $$invalidate(0, currentClue = $$props.currentClue);
		};

		$$self.$$.update = () => {
			if ($$self.$$.dirty & /*currentClue*/ 1) {
				$$invalidate(2, clue = currentClue["clue"] || "");
			}

			if ($$self.$$.dirty & /*currentClue*/ 1) {
				$$invalidate(1, custom = currentClue["custom"] || "");
			}
		};

		return [currentClue, custom, clue, dispatch, click_handler, click_handler_1];
	}

	class ClueBar extends SvelteComponent {
		constructor(options) {
			super();
			init(this, options, instance$5, create_fragment$5, safe_not_equal, { currentClue: 0 });
		}
	}

	/* ../src/Clues.svelte generated by Svelte v4.2.20 */

	function get_each_context$1(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[13] = list[i];
		return child_ctx;
	}

	// (42:4) {#each ["across", "down"] as direction}
	function create_each_block$1(ctx) {
		let cluelist;
		let current;

		function func(...args) {
			return /*func*/ ctx[12](/*direction*/ ctx[13], ...args);
		}

		cluelist = new ClueList({
				props: {
					direction: /*direction*/ ctx[13],
					focusedClueNumbers: /*focusedClueNumbers*/ ctx[5],
					clues: /*clues*/ ctx[1].filter(func),
					isDirectionFocused: /*focusedDirection*/ ctx[0] === /*direction*/ ctx[13],
					isDisableHighlight: /*isDisableHighlight*/ ctx[3],
					onClueFocus: /*onClueFocus*/ ctx[7]
				}
			});

		return {
			c() {
				create_component(cluelist.$$.fragment);
			},
			l(nodes) {
				claim_component(cluelist.$$.fragment, nodes);
			},
			m(target, anchor) {
				mount_component(cluelist, target, anchor);
				current = true;
			},
			p(new_ctx, dirty) {
				ctx = new_ctx;
				const cluelist_changes = {};
				if (dirty & /*focusedClueNumbers*/ 32) cluelist_changes.focusedClueNumbers = /*focusedClueNumbers*/ ctx[5];
				if (dirty & /*clues*/ 2) cluelist_changes.clues = /*clues*/ ctx[1].filter(func);
				if (dirty & /*focusedDirection*/ 1) cluelist_changes.isDirectionFocused = /*focusedDirection*/ ctx[0] === /*direction*/ ctx[13];
				if (dirty & /*isDisableHighlight*/ 8) cluelist_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[3];
				cluelist.$set(cluelist_changes);
			},
			i(local) {
				if (current) return;
				transition_in(cluelist.$$.fragment, local);
				current = true;
			},
			o(local) {
				transition_out(cluelist.$$.fragment, local);
				current = false;
			},
			d(detaching) {
				destroy_component(cluelist, detaching);
			}
		};
	}

	function create_fragment$4(ctx) {
		let section;
		let div0;
		let cluebar;
		let t;
		let div1;
		let current;

		cluebar = new ClueBar({
				props: { currentClue: /*currentClue*/ ctx[6] }
			});

		cluebar.$on("nextClue", /*onNextClue*/ ctx[8]);
		let each_value = ensure_array_like(["across", "down"]);
		let each_blocks = [];

		for (let i = 0; i < 2; i += 1) {
			each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
		}

		const out = i => transition_out(each_blocks[i], 1, 1, () => {
			each_blocks[i] = null;
		});

		return {
			c() {
				section = element("section");
				div0 = element("div");
				create_component(cluebar.$$.fragment);
				t = space();
				div1 = element("div");

				for (let i = 0; i < 2; i += 1) {
					each_blocks[i].c();
				}

				this.h();
			},
			l(nodes) {
				section = claim_element(nodes, "SECTION", { class: true });
				var section_nodes = children(section);
				div0 = claim_element(section_nodes, "DIV", { class: true });
				var div0_nodes = children(div0);
				claim_component(cluebar.$$.fragment, div0_nodes);
				div0_nodes.forEach(detach);
				t = claim_space(section_nodes);
				div1 = claim_element(section_nodes, "DIV", { class: true });
				var div1_nodes = children(div1);

				for (let i = 0; i < 2; i += 1) {
					each_blocks[i].l(div1_nodes);
				}

				div1_nodes.forEach(detach);
				section_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(div0, "class", "clues--stacked svelte-fisq29");
				attr(div1, "class", "clues--list svelte-fisq29");
				attr(section, "class", "clues svelte-fisq29");
				toggle_class(section, "stacked", /*stacked*/ ctx[2]);
				toggle_class(section, "is-loaded", /*isLoaded*/ ctx[4]);
			},
			m(target, anchor) {
				insert_hydration(target, section, anchor);
				append_hydration(section, div0);
				mount_component(cluebar, div0, null);
				append_hydration(section, t);
				append_hydration(section, div1);

				for (let i = 0; i < 2; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div1, null);
					}
				}

				current = true;
			},
			p(ctx, [dirty]) {
				const cluebar_changes = {};
				if (dirty & /*currentClue*/ 64) cluebar_changes.currentClue = /*currentClue*/ ctx[6];
				cluebar.$set(cluebar_changes);

				if (dirty & /*focusedClueNumbers, clues, focusedDirection, isDisableHighlight, onClueFocus*/ 171) {
					each_value = ensure_array_like(["across", "down"]);
					let i;

					for (i = 0; i < 2; i += 1) {
						const child_ctx = get_each_context$1(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
							transition_in(each_blocks[i], 1);
						} else {
							each_blocks[i] = create_each_block$1(child_ctx);
							each_blocks[i].c();
							transition_in(each_blocks[i], 1);
							each_blocks[i].m(div1, null);
						}
					}

					group_outros();

					for (i = 2; i < 2; i += 1) {
						out(i);
					}

					check_outros();
				}

				if (!current || dirty & /*stacked*/ 4) {
					toggle_class(section, "stacked", /*stacked*/ ctx[2]);
				}

				if (!current || dirty & /*isLoaded*/ 16) {
					toggle_class(section, "is-loaded", /*isLoaded*/ ctx[4]);
				}
			},
			i(local) {
				if (current) return;
				transition_in(cluebar.$$.fragment, local);

				for (let i = 0; i < 2; i += 1) {
					transition_in(each_blocks[i]);
				}

				current = true;
			},
			o(local) {
				transition_out(cluebar.$$.fragment, local);
				each_blocks = each_blocks.filter(Boolean);

				for (let i = 0; i < 2; i += 1) {
					transition_out(each_blocks[i]);
				}

				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(section);
				}

				destroy_component(cluebar);
				destroy_each(each_blocks, detaching);
			}
		};
	}

	function instance$4($$self, $$props, $$invalidate) {
		let focusedClueNumbers;
		let currentClue;
		let { clues } = $$props;
		let { cellIndexMap } = $$props;
		let { focusedDirection } = $$props;
		let { focusedCellIndex } = $$props;
		let { focusedCell } = $$props;
		let { stacked } = $$props;
		let { isDisableHighlight } = $$props;
		let { isLoaded } = $$props;

		function onClueFocus({ direction, id }) {
			$$invalidate(0, focusedDirection = direction);
			$$invalidate(9, focusedCellIndex = cellIndexMap[id] || 0);
		}

		function onNextClue({ detail }) {
			let next = detail;
			if (next < 0) next = clues.length - 1; else if (next > clues.length - 1) next = 0;
			const { direction, id } = clues[next];
			onClueFocus({ direction, id });
		}

		const func = (direction, d) => d.direction === direction;

		$$self.$$set = $$props => {
			if ('clues' in $$props) $$invalidate(1, clues = $$props.clues);
			if ('cellIndexMap' in $$props) $$invalidate(10, cellIndexMap = $$props.cellIndexMap);
			if ('focusedDirection' in $$props) $$invalidate(0, focusedDirection = $$props.focusedDirection);
			if ('focusedCellIndex' in $$props) $$invalidate(9, focusedCellIndex = $$props.focusedCellIndex);
			if ('focusedCell' in $$props) $$invalidate(11, focusedCell = $$props.focusedCell);
			if ('stacked' in $$props) $$invalidate(2, stacked = $$props.stacked);
			if ('isDisableHighlight' in $$props) $$invalidate(3, isDisableHighlight = $$props.isDisableHighlight);
			if ('isLoaded' in $$props) $$invalidate(4, isLoaded = $$props.isLoaded);
		};

		$$self.$$.update = () => {
			if ($$self.$$.dirty & /*focusedCell*/ 2048) {
				$$invalidate(5, focusedClueNumbers = focusedCell.clueNumbers || {});
			}

			if ($$self.$$.dirty & /*clues, focusedDirection, focusedClueNumbers*/ 35) {
				$$invalidate(6, currentClue = clues.find(c => c.direction === focusedDirection && c.number === focusedClueNumbers[focusedDirection]) || clues[0]);
			}
		};

		return [
			focusedDirection,
			clues,
			stacked,
			isDisableHighlight,
			isLoaded,
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

	class Clues extends SvelteComponent {
		constructor(options) {
			super();

			init(this, options, instance$4, create_fragment$4, safe_not_equal, {
				clues: 1,
				cellIndexMap: 10,
				focusedDirection: 0,
				focusedCellIndex: 9,
				focusedCell: 11,
				stacked: 2,
				isDisableHighlight: 3,
				isLoaded: 4
			});
		}
	}

	/*
	Adapted from https://github.com/mattdesl
	Distributed under MIT License https://github.com/mattdesl/eases/blob/master/LICENSE.md
	*/

	/**
	 * https://svelte.dev/docs/svelte-easing
	 * @param {number} t
	 * @returns {number}
	 */
	function quadIn(t) {
		return t * t;
	}

	/**
	 * Animates the opacity of an element from 0 to the current opacity for `in` transitions and from the current opacity to 0 for `out` transitions.
	 *
	 * https://svelte.dev/docs/svelte-transition#fade
	 * @param {Element} node
	 * @param {import('./public').FadeParams} [params]
	 * @returns {import('./public').TransitionConfig}
	 */
	function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
		const o = +getComputedStyle(node).opacity;
		return {
			delay,
			duration,
			easing,
			css: (t) => `opacity: ${t * o}`
		};
	}

	/* ../src/Confetti.svelte generated by Svelte v4.2.20 */

	function get_each_context(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[8] = list[i][0];
		child_ctx[9] = list[i][1];
		child_ctx[10] = list[i][2];
		child_ctx[12] = i;
		return child_ctx;
	}

	// (45:2) {#each allElements as [element, color, scale], i}
	function create_each_block(ctx) {
		let g1;
		let g0;
		let html_tag;
		let raw_value = /*element*/ ctx[8] + "";
		let g0_style_value;

		return {
			c() {
				g1 = svg_element("g");
				g0 = svg_element("g");
				html_tag = new HtmlTagHydration(true);
				this.h();
			},
			l(nodes) {
				g1 = claim_svg_element(nodes, "g", { style: true, class: true });
				var g1_nodes = children(g1);
				g0 = claim_svg_element(g1_nodes, "g", { fill: true, style: true, class: true });
				var g0_nodes = children(g0);
				html_tag = claim_html_tag(g0_nodes, true);
				g0_nodes.forEach(detach);
				g1_nodes.forEach(detach);
				this.h();
			},
			h() {
				html_tag.a = null;
				attr(g0, "fill", /*color*/ ctx[9]);

				attr(g0, "style", g0_style_value = [
					`--rotation: ${Math.random() * 360}deg`,
					`animation-delay: ${quadIn(/*i*/ ctx[12] / /*numberOfElements*/ ctx[0])}s`,
					`animation-duration: ${/*durationInSeconds*/ ctx[1] * /*randomNumber*/ ctx[2](0.7, 1)}s`
				].join(';'));

				attr(g0, "class", "svelte-g0yr08");
				set_style(g1, "transform", "scale(" + /*scale*/ ctx[10] + ")");
				attr(g1, "class", "svelte-g0yr08");
			},
			m(target, anchor) {
				insert_hydration(target, g1, anchor);
				append_hydration(g1, g0);
				html_tag.m(raw_value, g0);
			},
			p(ctx, dirty) {
				if (dirty & /*numberOfElements, durationInSeconds*/ 3 && g0_style_value !== (g0_style_value = [
					`--rotation: ${Math.random() * 360}deg`,
					`animation-delay: ${quadIn(/*i*/ ctx[12] / /*numberOfElements*/ ctx[0])}s`,
					`animation-duration: ${/*durationInSeconds*/ ctx[1] * /*randomNumber*/ ctx[2](0.7, 1)}s`
				].join(';'))) {
					attr(g0, "style", g0_style_value);
				}
			},
			d(detaching) {
				if (detaching) {
					detach(g1);
				}
			}
		};
	}

	function create_fragment$3(ctx) {
		let svg;
		let each_value = ensure_array_like(/*allElements*/ ctx[3]);
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
		}

		return {
			c() {
				svg = svg_element("svg");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				this.h();
			},
			l(nodes) {
				svg = claim_svg_element(nodes, "svg", { class: true, viewBox: true });
				var svg_nodes = children(svg);

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].l(svg_nodes);
				}

				svg_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(svg, "class", "crosswords-confetti svelte-g0yr08");
				attr(svg, "viewBox", "-10 -10 10 10");
			},
			m(target, anchor) {
				insert_hydration(target, svg, anchor);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(svg, null);
					}
				}
			},
			p(ctx, [dirty]) {
				if (dirty & /*allElements, Math, numberOfElements, durationInSeconds, randomNumber*/ 15) {
					each_value = ensure_array_like(/*allElements*/ ctx[3]);
					let i;

					for (i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
						} else {
							each_blocks[i] = create_each_block(child_ctx);
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
			d(detaching) {
				if (detaching) {
					detach(svg);
				}

				destroy_each(each_blocks, detaching);
			}
		};
	}

	function instance$3($$self, $$props, $$invalidate) {
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

		$$self.$$set = $$props => {
			if ('numberOfElements' in $$props) $$invalidate(0, numberOfElements = $$props.numberOfElements);
			if ('durationInSeconds' in $$props) $$invalidate(1, durationInSeconds = $$props.durationInSeconds);
			if ('colors' in $$props) $$invalidate(4, colors = $$props.colors);
		};

		return [numberOfElements, durationInSeconds, randomNumber, allElements, colors];
	}

	class Confetti extends SvelteComponent {
		constructor(options) {
			super();

			init(this, options, instance$3, create_fragment$3, safe_not_equal, {
				numberOfElements: 0,
				durationInSeconds: 1,
				colors: 4
			});
		}
	}

	/* ../src/CompletedMessage.svelte generated by Svelte v4.2.20 */

	function create_if_block$1(ctx) {
		let div2;
		let div1;
		let div0;
		let t0;
		let button0;
		let textContent = "Back";
		let t2;
		let div2_transition;
		let t3;
		let button1;
		let button1_transition;
		let current;
		let mounted;
		let dispose;
		const default_slot_template = /*#slots*/ ctx[3].default;
		const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);
		let if_block = /*showConfetti*/ ctx[0] && create_if_block_1$1();

		return {
			c() {
				div2 = element("div");
				div1 = element("div");
				div0 = element("div");
				if (default_slot) default_slot.c();
				t0 = space();
				button0 = element("button");
				button0.textContent = textContent;
				t2 = space();
				if (if_block) if_block.c();
				t3 = space();
				button1 = element("button");
				this.h();
			},
			l(nodes) {
				div2 = claim_element(nodes, "DIV", { class: true });
				var div2_nodes = children(div2);
				div1 = claim_element(div2_nodes, "DIV", { class: true });
				var div1_nodes = children(div1);
				div0 = claim_element(div1_nodes, "DIV", { class: true });
				var div0_nodes = children(div0);
				if (default_slot) default_slot.l(div0_nodes);
				div0_nodes.forEach(detach);
				t0 = claim_space(div1_nodes);
				button0 = claim_element(div1_nodes, "BUTTON", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(button0) !== "svelte-p5n267") button0.textContent = textContent;
				div1_nodes.forEach(detach);
				t2 = claim_space(div2_nodes);
				if (if_block) if_block.l(div2_nodes);
				div2_nodes.forEach(detach);
				t3 = claim_space(nodes);
				button1 = claim_element(nodes, "BUTTON", { class: true });
				children(button1).forEach(detach);
				this.h();
			},
			h() {
				attr(div0, "class", "message svelte-kup4wm");
				attr(button0, "class", "button svelte-kup4wm");
				attr(div1, "class", "content svelte-kup4wm");
				attr(div2, "class", "completed svelte-kup4wm");
				attr(button1, "class", "curtain svelte-kup4wm");
			},
			m(target, anchor) {
				insert_hydration(target, div2, anchor);
				append_hydration(div2, div1);
				append_hydration(div1, div0);

				if (default_slot) {
					default_slot.m(div0, null);
				}

				append_hydration(div1, t0);
				append_hydration(div1, button0);
				append_hydration(div2, t2);
				if (if_block) if_block.m(div2, null);
				insert_hydration(target, t3, anchor);
				insert_hydration(target, button1, anchor);
				current = true;

				if (!mounted) {
					dispose = [
						listen(button0, "click", /*click_handler*/ ctx[4]),
						listen(button1, "click", /*click_handler_1*/ ctx[5])
					];

					mounted = true;
				}
			},
			p(ctx, dirty) {
				if (default_slot) {
					if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
						update_slot_base(
							default_slot,
							default_slot_template,
							ctx,
							/*$$scope*/ ctx[2],
							!current
							? get_all_dirty_from_scope(/*$$scope*/ ctx[2])
							: get_slot_changes(default_slot_template, /*$$scope*/ ctx[2], dirty, null),
							null
						);
					}
				}

				if (/*showConfetti*/ ctx[0]) {
					if (if_block) {
						if (dirty & /*showConfetti*/ 1) {
							transition_in(if_block, 1);
						}
					} else {
						if_block = create_if_block_1$1();
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
			i(local) {
				if (current) return;
				transition_in(default_slot, local);
				transition_in(if_block);

				if (local) {
					add_render_callback(() => {
						if (!current) return;
						if (!div2_transition) div2_transition = create_bidirectional_transition(div2, fade, {}, true);
						div2_transition.run(1);
					});
				}

				if (local) {
					add_render_callback(() => {
						if (!current) return;
						if (!button1_transition) button1_transition = create_bidirectional_transition(button1, fade, { duration: 250 }, true);
						button1_transition.run(1);
					});
				}

				current = true;
			},
			o(local) {
				transition_out(default_slot, local);
				transition_out(if_block);

				if (local) {
					if (!div2_transition) div2_transition = create_bidirectional_transition(div2, fade, {}, false);
					div2_transition.run(0);
				}

				if (local) {
					if (!button1_transition) button1_transition = create_bidirectional_transition(button1, fade, { duration: 250 }, false);
					button1_transition.run(0);
				}

				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(div2);
					detach(t3);
					detach(button1);
				}

				if (default_slot) default_slot.d(detaching);
				if (if_block) if_block.d();
				if (detaching && div2_transition) div2_transition.end();
				if (detaching && button1_transition) button1_transition.end();
				mounted = false;
				run_all(dispose);
			}
		};
	}

	// (20:4) {#if showConfetti}
	function create_if_block_1$1(ctx) {
		let div;
		let confetti;
		let current;
		confetti = new Confetti({});

		return {
			c() {
				div = element("div");
				create_component(confetti.$$.fragment);
				this.h();
			},
			l(nodes) {
				div = claim_element(nodes, "DIV", { class: true });
				var div_nodes = children(div);
				claim_component(confetti.$$.fragment, div_nodes);
				div_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(div, "class", "confetti svelte-kup4wm");
			},
			m(target, anchor) {
				insert_hydration(target, div, anchor);
				mount_component(confetti, div, null);
				current = true;
			},
			i(local) {
				if (current) return;
				transition_in(confetti.$$.fragment, local);
				current = true;
			},
			o(local) {
				transition_out(confetti.$$.fragment, local);
				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				destroy_component(confetti);
			}
		};
	}

	function create_fragment$2(ctx) {
		let if_block_anchor;
		let current;
		let if_block = /*isOpen*/ ctx[1] && create_if_block$1(ctx);

		return {
			c() {
				if (if_block) if_block.c();
				if_block_anchor = empty();
			},
			l(nodes) {
				if (if_block) if_block.l(nodes);
				if_block_anchor = empty();
			},
			m(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert_hydration(target, if_block_anchor, anchor);
				current = true;
			},
			p(ctx, [dirty]) {
				if (/*isOpen*/ ctx[1]) {
					if (if_block) {
						if_block.p(ctx, dirty);

						if (dirty & /*isOpen*/ 2) {
							transition_in(if_block, 1);
						}
					} else {
						if_block = create_if_block$1(ctx);
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
			i(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o(local) {
				transition_out(if_block);
				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(if_block_anchor);
				}

				if (if_block) if_block.d(detaching);
			}
		};
	}

	function instance$2($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		let { showConfetti = true } = $$props;
		let isOpen = true;
		const click_handler = () => $$invalidate(1, isOpen = false);
		const click_handler_1 = () => $$invalidate(1, isOpen = false);

		$$self.$$set = $$props => {
			if ('showConfetti' in $$props) $$invalidate(0, showConfetti = $$props.showConfetti);
			if ('$$scope' in $$props) $$invalidate(2, $$scope = $$props.$$scope);
		};

		return [showConfetti, isOpen, $$scope, slots, click_handler, click_handler_1];
	}

	class CompletedMessage extends SvelteComponent {
		constructor(options) {
			super();
			init(this, options, instance$2, create_fragment$2, safe_not_equal, { showConfetti: 0 });
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

	var classic = {
		"font": "sans-serif",
		"primary-highlight-color": "#ffda00",
		"secondary-highlight-color": "#a7d8ff",
		"main-color": "#1a1a1a",
		"bg-color": "#fff",
		"accent-color": "#efefef",
		"scrollbar-color": "#cdcdcd",
		"order": "row"
	};

	var dark = {
		"primary-highlight-color": "#066",
		"secondary-highlight-color": "#003d3d",
		"main-color": "#efefef",
		"bg-color": "#1a1a1a",
		"accent-color": "#3a3a3a"
	};

	var citrus = {
		"primary-highlight-color": "#ff957d",
		"secondary-highlight-color": "#ffdfd5",
		"main-color": "#184444",
		"accent-color": "#ebf3f3"
	};

	var amelia = {
		"font": "sans-serif",
		"primary-highlight-color": "#d7cefd",
		"secondary-highlight-color": "#9980fa",
		"main-color": "#353b48",
		"bg-color": "#fff",
		"accent-color": "#efefef",
		"scrollbar-color": "#9980fa",
	};

	const themes = { classic, dark, citrus, amelia };
	const defaultTheme = themes["classic"];

	Object.keys(themes).forEach((t) => {
		themes[t] = Object.keys(defaultTheme)
			.map((d) => `--${d}: var(--xd-${d}, ${themes[t][d] || defaultTheme[d]})`)
			.join(";");
	});

	/* ../src/Crossword.svelte generated by Svelte v4.2.20 */
	const get_message_slot_changes = dirty => ({});
	const get_message_slot_context = ctx => ({});
	const get_toolbar_slot_changes = dirty => ({});

	const get_toolbar_slot_context = ctx => ({
		onClear: /*onClear*/ ctx[21],
		onReveal: /*onReveal*/ ctx[22],
		onCheck: /*onCheck*/ ctx[23]
	});

	// (134:0) {#if validated}
	function create_if_block(ctx) {
		let div1;
		let t0;
		let div0;
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
		let div1_resize_listener;
		let current;
		const toolbar_slot_template = /*#slots*/ ctx[31].toolbar;
		const toolbar_slot = create_slot(toolbar_slot_template, ctx, /*$$scope*/ ctx[39], get_toolbar_slot_context);
		const toolbar_slot_or_fallback = toolbar_slot || fallback_block_1(ctx);

		function clues_1_focusedCellIndex_binding(value) {
			/*clues_1_focusedCellIndex_binding*/ ctx[32](value);
		}

		function clues_1_focusedCell_binding(value) {
			/*clues_1_focusedCell_binding*/ ctx[33](value);
		}

		function clues_1_focusedDirection_binding(value) {
			/*clues_1_focusedDirection_binding*/ ctx[34](value);
		}

		let clues_1_props = {
			clues: /*clues*/ ctx[8],
			cellIndexMap: /*cellIndexMap*/ ctx[19],
			stacked: /*stacked*/ ctx[17],
			isDisableHighlight: /*isDisableHighlight*/ ctx[18],
			isLoaded: /*isLoaded*/ ctx[13]
		};

		if (/*focusedCellIndex*/ ctx[7] !== void 0) {
			clues_1_props.focusedCellIndex = /*focusedCellIndex*/ ctx[7];
		}

		if (/*focusedCell*/ ctx[20] !== void 0) {
			clues_1_props.focusedCell = /*focusedCell*/ ctx[20];
		}

		if (/*focusedDirection*/ ctx[11] !== void 0) {
			clues_1_props.focusedDirection = /*focusedDirection*/ ctx[11];
		}

		clues_1 = new Clues({ props: clues_1_props });
		binding_callbacks.push(() => bind(clues_1, 'focusedCellIndex', clues_1_focusedCellIndex_binding));
		binding_callbacks.push(() => bind(clues_1, 'focusedCell', clues_1_focusedCell_binding));
		binding_callbacks.push(() => bind(clues_1, 'focusedDirection', clues_1_focusedDirection_binding));

		function puzzle_cells_binding(value) {
			/*puzzle_cells_binding*/ ctx[35](value);
		}

		function puzzle_focusedCellIndex_binding(value) {
			/*puzzle_focusedCellIndex_binding*/ ctx[36](value);
		}

		function puzzle_focusedDirection_binding(value) {
			/*puzzle_focusedDirection_binding*/ ctx[37](value);
		}

		let puzzle_props = {
			clues: /*clues*/ ctx[8],
			focusedCell: /*focusedCell*/ ctx[20],
			isRevealing: /*isRevealing*/ ctx[12],
			isChecking: /*isChecking*/ ctx[14],
			isDisableHighlight: /*isDisableHighlight*/ ctx[18],
			revealDuration: /*revealDuration*/ ctx[1],
			showKeyboard: /*showKeyboard*/ ctx[4],
			stacked: /*stacked*/ ctx[17],
			isLoaded: /*isLoaded*/ ctx[13],
			keyboardStyle: /*keyboardStyle*/ ctx[5]
		};

		if (/*cells*/ ctx[9] !== void 0) {
			puzzle_props.cells = /*cells*/ ctx[9];
		}

		if (/*focusedCellIndex*/ ctx[7] !== void 0) {
			puzzle_props.focusedCellIndex = /*focusedCellIndex*/ ctx[7];
		}

		if (/*focusedDirection*/ ctx[11] !== void 0) {
			puzzle_props.focusedDirection = /*focusedDirection*/ ctx[11];
		}

		puzzle = new Puzzle({ props: puzzle_props });
		binding_callbacks.push(() => bind(puzzle, 'cells', puzzle_cells_binding));
		binding_callbacks.push(() => bind(puzzle, 'focusedCellIndex', puzzle_focusedCellIndex_binding));
		binding_callbacks.push(() => bind(puzzle, 'focusedDirection', puzzle_focusedDirection_binding));
		let if_block = /*isComplete*/ ctx[10] && !/*isRevealing*/ ctx[12] && /*showCompleteMessage*/ ctx[2] && create_if_block_1(ctx);

		return {
			c() {
				div1 = element("div");
				if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.c();
				t0 = space();
				div0 = element("div");
				create_component(clues_1.$$.fragment);
				t1 = space();
				create_component(puzzle.$$.fragment);
				t2 = space();
				if (if_block) if_block.c();
				this.h();
			},
			l(nodes) {
				div1 = claim_element(nodes, "DIV", { class: true, style: true });
				var div1_nodes = children(div1);
				if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.l(div1_nodes);
				t0 = claim_space(div1_nodes);
				div0 = claim_element(div1_nodes, "DIV", { class: true });
				var div0_nodes = children(div0);
				claim_component(clues_1.$$.fragment, div0_nodes);
				t1 = claim_space(div0_nodes);
				claim_component(puzzle.$$.fragment, div0_nodes);
				div0_nodes.forEach(detach);
				t2 = claim_space(div1_nodes);
				if (if_block) if_block.l(div1_nodes);
				div1_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(div0, "class", "play svelte-11ckcvo");
				toggle_class(div0, "stacked", /*stacked*/ ctx[17]);
				toggle_class(div0, "is-loaded", /*isLoaded*/ ctx[13]);
				attr(div1, "class", "svelte-crossword svelte-11ckcvo");
				attr(div1, "style", /*inlineStyles*/ ctx[16]);
				add_render_callback(() => /*div1_elementresize_handler*/ ctx[38].call(div1));
			},
			m(target, anchor) {
				insert_hydration(target, div1, anchor);

				if (toolbar_slot_or_fallback) {
					toolbar_slot_or_fallback.m(div1, null);
				}

				append_hydration(div1, t0);
				append_hydration(div1, div0);
				mount_component(clues_1, div0, null);
				append_hydration(div0, t1);
				mount_component(puzzle, div0, null);
				append_hydration(div1, t2);
				if (if_block) if_block.m(div1, null);
				div1_resize_listener = add_iframe_resize_listener(div1, /*div1_elementresize_handler*/ ctx[38].bind(div1));
				current = true;
			},
			p(ctx, dirty) {
				if (toolbar_slot) {
					if (toolbar_slot.p && (!current || dirty[1] & /*$$scope*/ 256)) {
						update_slot_base(
							toolbar_slot,
							toolbar_slot_template,
							ctx,
							/*$$scope*/ ctx[39],
							!current
							? get_all_dirty_from_scope(/*$$scope*/ ctx[39])
							: get_slot_changes(toolbar_slot_template, /*$$scope*/ ctx[39], dirty, get_toolbar_slot_changes),
							get_toolbar_slot_context
						);
					}
				} else {
					if (toolbar_slot_or_fallback && toolbar_slot_or_fallback.p && (!current || dirty[0] & /*actions*/ 1)) {
						toolbar_slot_or_fallback.p(ctx, !current ? [-1, -1] : dirty);
					}
				}

				const clues_1_changes = {};
				if (dirty[0] & /*clues*/ 256) clues_1_changes.clues = /*clues*/ ctx[8];
				if (dirty[0] & /*cellIndexMap*/ 524288) clues_1_changes.cellIndexMap = /*cellIndexMap*/ ctx[19];
				if (dirty[0] & /*stacked*/ 131072) clues_1_changes.stacked = /*stacked*/ ctx[17];
				if (dirty[0] & /*isDisableHighlight*/ 262144) clues_1_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[18];
				if (dirty[0] & /*isLoaded*/ 8192) clues_1_changes.isLoaded = /*isLoaded*/ ctx[13];

				if (!updating_focusedCellIndex && dirty[0] & /*focusedCellIndex*/ 128) {
					updating_focusedCellIndex = true;
					clues_1_changes.focusedCellIndex = /*focusedCellIndex*/ ctx[7];
					add_flush_callback(() => updating_focusedCellIndex = false);
				}

				if (!updating_focusedCell && dirty[0] & /*focusedCell*/ 1048576) {
					updating_focusedCell = true;
					clues_1_changes.focusedCell = /*focusedCell*/ ctx[20];
					add_flush_callback(() => updating_focusedCell = false);
				}

				if (!updating_focusedDirection && dirty[0] & /*focusedDirection*/ 2048) {
					updating_focusedDirection = true;
					clues_1_changes.focusedDirection = /*focusedDirection*/ ctx[11];
					add_flush_callback(() => updating_focusedDirection = false);
				}

				clues_1.$set(clues_1_changes);
				const puzzle_changes = {};
				if (dirty[0] & /*clues*/ 256) puzzle_changes.clues = /*clues*/ ctx[8];
				if (dirty[0] & /*focusedCell*/ 1048576) puzzle_changes.focusedCell = /*focusedCell*/ ctx[20];
				if (dirty[0] & /*isRevealing*/ 4096) puzzle_changes.isRevealing = /*isRevealing*/ ctx[12];
				if (dirty[0] & /*isChecking*/ 16384) puzzle_changes.isChecking = /*isChecking*/ ctx[14];
				if (dirty[0] & /*isDisableHighlight*/ 262144) puzzle_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[18];
				if (dirty[0] & /*revealDuration*/ 2) puzzle_changes.revealDuration = /*revealDuration*/ ctx[1];
				if (dirty[0] & /*showKeyboard*/ 16) puzzle_changes.showKeyboard = /*showKeyboard*/ ctx[4];
				if (dirty[0] & /*stacked*/ 131072) puzzle_changes.stacked = /*stacked*/ ctx[17];
				if (dirty[0] & /*isLoaded*/ 8192) puzzle_changes.isLoaded = /*isLoaded*/ ctx[13];
				if (dirty[0] & /*keyboardStyle*/ 32) puzzle_changes.keyboardStyle = /*keyboardStyle*/ ctx[5];

				if (!updating_cells && dirty[0] & /*cells*/ 512) {
					updating_cells = true;
					puzzle_changes.cells = /*cells*/ ctx[9];
					add_flush_callback(() => updating_cells = false);
				}

				if (!updating_focusedCellIndex_1 && dirty[0] & /*focusedCellIndex*/ 128) {
					updating_focusedCellIndex_1 = true;
					puzzle_changes.focusedCellIndex = /*focusedCellIndex*/ ctx[7];
					add_flush_callback(() => updating_focusedCellIndex_1 = false);
				}

				if (!updating_focusedDirection_1 && dirty[0] & /*focusedDirection*/ 2048) {
					updating_focusedDirection_1 = true;
					puzzle_changes.focusedDirection = /*focusedDirection*/ ctx[11];
					add_flush_callback(() => updating_focusedDirection_1 = false);
				}

				puzzle.$set(puzzle_changes);

				if (!current || dirty[0] & /*stacked*/ 131072) {
					toggle_class(div0, "stacked", /*stacked*/ ctx[17]);
				}

				if (!current || dirty[0] & /*isLoaded*/ 8192) {
					toggle_class(div0, "is-loaded", /*isLoaded*/ ctx[13]);
				}

				if (/*isComplete*/ ctx[10] && !/*isRevealing*/ ctx[12] && /*showCompleteMessage*/ ctx[2]) {
					if (if_block) {
						if_block.p(ctx, dirty);

						if (dirty[0] & /*isComplete, isRevealing, showCompleteMessage*/ 5124) {
							transition_in(if_block, 1);
						}
					} else {
						if_block = create_if_block_1(ctx);
						if_block.c();
						transition_in(if_block, 1);
						if_block.m(div1, null);
					}
				} else if (if_block) {
					group_outros();

					transition_out(if_block, 1, 1, () => {
						if_block = null;
					});

					check_outros();
				}

				if (!current || dirty[0] & /*inlineStyles*/ 65536) {
					attr(div1, "style", /*inlineStyles*/ ctx[16]);
				}
			},
			i(local) {
				if (current) return;
				transition_in(toolbar_slot_or_fallback, local);
				transition_in(clues_1.$$.fragment, local);
				transition_in(puzzle.$$.fragment, local);
				transition_in(if_block);
				current = true;
			},
			o(local) {
				transition_out(toolbar_slot_or_fallback, local);
				transition_out(clues_1.$$.fragment, local);
				transition_out(puzzle.$$.fragment, local);
				transition_out(if_block);
				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(div1);
				}

				if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.d(detaching);
				destroy_component(clues_1);
				destroy_component(puzzle);
				if (if_block) if_block.d();
				div1_resize_listener();
			}
		};
	}

	// (145:5)        
	function fallback_block_1(ctx) {
		let toolbar;
		let current;
		toolbar = new Toolbar({ props: { actions: /*actions*/ ctx[0] } });
		toolbar.$on("event", /*onToolbarEvent*/ ctx[24]);

		return {
			c() {
				create_component(toolbar.$$.fragment);
			},
			l(nodes) {
				claim_component(toolbar.$$.fragment, nodes);
			},
			m(target, anchor) {
				mount_component(toolbar, target, anchor);
				current = true;
			},
			p(ctx, dirty) {
				const toolbar_changes = {};
				if (dirty[0] & /*actions*/ 1) toolbar_changes.actions = /*actions*/ ctx[0];
				toolbar.$set(toolbar_changes);
			},
			i(local) {
				if (current) return;
				transition_in(toolbar.$$.fragment, local);
				current = true;
			},
			o(local) {
				transition_out(toolbar.$$.fragment, local);
				current = false;
			},
			d(detaching) {
				destroy_component(toolbar, detaching);
			}
		};
	}

	// (177:4) {#if isComplete && !isRevealing && showCompleteMessage}
	function create_if_block_1(ctx) {
		let completedmessage;
		let current;

		completedmessage = new CompletedMessage({
				props: {
					showConfetti: /*showConfetti*/ ctx[3],
					$$slots: { default: [create_default_slot] },
					$$scope: { ctx }
				}
			});

		return {
			c() {
				create_component(completedmessage.$$.fragment);
			},
			l(nodes) {
				claim_component(completedmessage.$$.fragment, nodes);
			},
			m(target, anchor) {
				mount_component(completedmessage, target, anchor);
				current = true;
			},
			p(ctx, dirty) {
				const completedmessage_changes = {};
				if (dirty[0] & /*showConfetti*/ 8) completedmessage_changes.showConfetti = /*showConfetti*/ ctx[3];

				if (dirty[1] & /*$$scope*/ 256) {
					completedmessage_changes.$$scope = { dirty, ctx };
				}

				completedmessage.$set(completedmessage_changes);
			},
			i(local) {
				if (current) return;
				transition_in(completedmessage.$$.fragment, local);
				current = true;
			},
			o(local) {
				transition_out(completedmessage.$$.fragment, local);
				current = false;
			},
			d(detaching) {
				destroy_component(completedmessage, detaching);
			}
		};
	}

	// (179:29)            
	function fallback_block(ctx) {
		let h3;
		let textContent = "You solved it!";

		return {
			c() {
				h3 = element("h3");
				h3.textContent = textContent;
				this.h();
			},
			l(nodes) {
				h3 = claim_element(nodes, "H3", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(h3) !== "svelte-1eylras") h3.textContent = textContent;
				this.h();
			},
			h() {
				attr(h3, "class", "svelte-11ckcvo");
			},
			m(target, anchor) {
				insert_hydration(target, h3, anchor);
			},
			p: noop,
			d(detaching) {
				if (detaching) {
					detach(h3);
				}
			}
		};
	}

	// (178:6) <CompletedMessage showConfetti="{showConfetti}">
	function create_default_slot(ctx) {
		let current;
		const message_slot_template = /*#slots*/ ctx[31].message;
		const message_slot = create_slot(message_slot_template, ctx, /*$$scope*/ ctx[39], get_message_slot_context);
		const message_slot_or_fallback = message_slot || fallback_block();

		return {
			c() {
				if (message_slot_or_fallback) message_slot_or_fallback.c();
			},
			l(nodes) {
				if (message_slot_or_fallback) message_slot_or_fallback.l(nodes);
			},
			m(target, anchor) {
				if (message_slot_or_fallback) {
					message_slot_or_fallback.m(target, anchor);
				}

				current = true;
			},
			p(ctx, dirty) {
				if (message_slot) {
					if (message_slot.p && (!current || dirty[1] & /*$$scope*/ 256)) {
						update_slot_base(
							message_slot,
							message_slot_template,
							ctx,
							/*$$scope*/ ctx[39],
							!current
							? get_all_dirty_from_scope(/*$$scope*/ ctx[39])
							: get_slot_changes(message_slot_template, /*$$scope*/ ctx[39], dirty, get_message_slot_changes),
							get_message_slot_context
						);
					}
				}
			},
			i(local) {
				if (current) return;
				transition_in(message_slot_or_fallback, local);
				current = true;
			},
			o(local) {
				transition_out(message_slot_or_fallback, local);
				current = false;
			},
			d(detaching) {
				if (message_slot_or_fallback) message_slot_or_fallback.d(detaching);
			}
		};
	}

	function create_fragment$1(ctx) {
		let if_block_anchor;
		let current;
		let if_block = /*validated*/ ctx[15] && create_if_block(ctx);

		return {
			c() {
				if (if_block) if_block.c();
				if_block_anchor = empty();
			},
			l(nodes) {
				if (if_block) if_block.l(nodes);
				if_block_anchor = empty();
			},
			m(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert_hydration(target, if_block_anchor, anchor);
				current = true;
			},
			p(ctx, dirty) {
				if (/*validated*/ ctx[15]) {
					if (if_block) {
						if_block.p(ctx, dirty);

						if (dirty[0] & /*validated*/ 32768) {
							transition_in(if_block, 1);
						}
					} else {
						if_block = create_if_block(ctx);
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
			i(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o(local) {
				transition_out(if_block);
				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(if_block_anchor);
				}

				if (if_block) if_block.d(detaching);
			}
		};
	}

	function instance$1($$self, $$props, $$invalidate) {
		let focusedCell;
		let cellIndexMap;
		let percentCorrect;
		let isComplete;
		let isDisableHighlight;
		let stacked;
		let inlineStyles;
		let { $$slots: slots = {}, $$scope } = $$props;
		let { data = [] } = $$props;
		let { actions = ["clear", "reveal", "check"] } = $$props;
		let { theme = "classic" } = $$props;
		let { revealDuration = 1000 } = $$props;
		let { breakpoint = 720 } = $$props;
		let { revealed = false } = $$props;
		let { disableHighlight = false } = $$props;
		let { showCompleteMessage = true } = $$props;
		let { showConfetti = true } = $$props;
		let { showKeyboard = false } = $$props;
		let { keyboardStyle = "outline" } = $$props;
		let width = 0;
		let focusedDirection = "across";
		let focusedCellIndex = 0;
		let isRevealing = false;
		let isLoaded = false;
		let isChecking = false;
		let revealTimeout;
		let originalClues = [];
		let validated = [];
		let clues = [];
		let cells = [];
		const dispatch = createEventDispatcher();

		const onDataUpdate = () => {
			originalClues = createClues(data);
			$$invalidate(15, validated = validateClues(originalClues));
			$$invalidate(8, clues = originalClues.map(d => ({ ...d })));
			$$invalidate(9, cells = createCells(originalClues));
			reset();
		};

		onMount(() => {
			$$invalidate(13, isLoaded = true);
		});

		function checkClues() {
			return clues.map(d => {
				d.index;

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
			$$invalidate(12, isRevealing = false);
			$$invalidate(14, isChecking = false);
			$$invalidate(7, focusedCellIndex = 0);
			$$invalidate(11, focusedDirection = "across");
		}

		function onClear() {
			reset();
			if (revealTimeout) clearTimeout(revealTimeout);
			$$invalidate(9, cells = cells.map(cell => ({ ...cell, value: "" })));
		}

		function onReveal() {
			if (revealed) return true;
			reset();
			$$invalidate(9, cells = cells.map(cell => ({ ...cell, value: cell.answer })));
			startReveal();
		}

		function onCheck() {
			$$invalidate(14, isChecking = true);
		}

		function startReveal() {
			$$invalidate(12, isRevealing = true);
			$$invalidate(14, isChecking = false);
			if (revealTimeout) clearTimeout(revealTimeout);

			revealTimeout = setTimeout(
				() => {
					$$invalidate(12, isRevealing = false);
				},
				revealDuration + 250
			);
		}

		function onToolbarEvent({ detail }) {
			if (detail === "clear") onClear(); else if (detail === "reveal") onReveal(); else if (detail === "check") onCheck();
		}

		function clues_1_focusedCellIndex_binding(value) {
			focusedCellIndex = value;
			$$invalidate(7, focusedCellIndex);
		}

		function clues_1_focusedCell_binding(value) {
			focusedCell = value;
			(($$invalidate(20, focusedCell), $$invalidate(9, cells)), $$invalidate(7, focusedCellIndex));
		}

		function clues_1_focusedDirection_binding(value) {
			focusedDirection = value;
			$$invalidate(11, focusedDirection);
		}

		function puzzle_cells_binding(value) {
			cells = value;
			$$invalidate(9, cells);
		}

		function puzzle_focusedCellIndex_binding(value) {
			focusedCellIndex = value;
			$$invalidate(7, focusedCellIndex);
		}

		function puzzle_focusedDirection_binding(value) {
			focusedDirection = value;
			$$invalidate(11, focusedDirection);
		}

		function div1_elementresize_handler() {
			width = this.offsetWidth;
			$$invalidate(6, width);
		}

		$$self.$$set = $$props => {
			if ('data' in $$props) $$invalidate(26, data = $$props.data);
			if ('actions' in $$props) $$invalidate(0, actions = $$props.actions);
			if ('theme' in $$props) $$invalidate(27, theme = $$props.theme);
			if ('revealDuration' in $$props) $$invalidate(1, revealDuration = $$props.revealDuration);
			if ('breakpoint' in $$props) $$invalidate(28, breakpoint = $$props.breakpoint);
			if ('revealed' in $$props) $$invalidate(25, revealed = $$props.revealed);
			if ('disableHighlight' in $$props) $$invalidate(29, disableHighlight = $$props.disableHighlight);
			if ('showCompleteMessage' in $$props) $$invalidate(2, showCompleteMessage = $$props.showCompleteMessage);
			if ('showConfetti' in $$props) $$invalidate(3, showConfetti = $$props.showConfetti);
			if ('showKeyboard' in $$props) $$invalidate(4, showKeyboard = $$props.showKeyboard);
			if ('keyboardStyle' in $$props) $$invalidate(5, keyboardStyle = $$props.keyboardStyle);
			if ('$$scope' in $$props) $$invalidate(39, $$scope = $$props.$$scope);
		};

		$$self.$$.update = () => {
			if ($$self.$$.dirty[0] & /*data*/ 67108864) {
				(onDataUpdate());
			}

			if ($$self.$$.dirty[0] & /*cells, focusedCellIndex*/ 640) {
				$$invalidate(20, focusedCell = cells[focusedCellIndex] || {});
			}

			if ($$self.$$.dirty[0] & /*cells*/ 512) {
				$$invalidate(19, cellIndexMap = fromPairs(cells.map(cell => [cell.id, cell.index])));
			}

			if ($$self.$$.dirty[0] & /*cells*/ 512) {
				$$invalidate(30, percentCorrect = cells.filter(d => d.answer === d.value).length / cells.length);
			}

			if ($$self.$$.dirty[0] & /*percentCorrect*/ 1073741824) {
				$$invalidate(10, isComplete = percentCorrect == 1);
			}

			if ($$self.$$.dirty[0] & /*isComplete*/ 1024) {
				(dispatch("completed", { isComplete }));
			}

			if ($$self.$$.dirty[0] & /*isComplete, disableHighlight*/ 536871936) {
				$$invalidate(18, isDisableHighlight = isComplete && disableHighlight);
			}

			if ($$self.$$.dirty[0] & /*cells*/ 512) {
				($$invalidate(8, clues = checkClues()));
			}

			if ($$self.$$.dirty[0] & /*cells, clues*/ 768) {
				($$invalidate(25, revealed = !clues.filter(d => !d.isCorrect).length));
			}

			if ($$self.$$.dirty[0] & /*width, breakpoint*/ 268435520) {
				$$invalidate(17, stacked = width < breakpoint);
			}

			if ($$self.$$.dirty[0] & /*theme*/ 134217728) {
				$$invalidate(16, inlineStyles = themes[theme]);
			}
		};

		return [
			actions,
			revealDuration,
			showCompleteMessage,
			showConfetti,
			showKeyboard,
			keyboardStyle,
			width,
			focusedCellIndex,
			clues,
			cells,
			isComplete,
			focusedDirection,
			isRevealing,
			isLoaded,
			isChecking,
			validated,
			inlineStyles,
			stacked,
			isDisableHighlight,
			cellIndexMap,
			focusedCell,
			onClear,
			onReveal,
			onCheck,
			onToolbarEvent,
			revealed,
			data,
			theme,
			breakpoint,
			disableHighlight,
			percentCorrect,
			slots,
			clues_1_focusedCellIndex_binding,
			clues_1_focusedCell_binding,
			clues_1_focusedDirection_binding,
			puzzle_cells_binding,
			puzzle_focusedCellIndex_binding,
			puzzle_focusedDirection_binding,
			div1_elementresize_handler,
			$$scope
		];
	}

	class Crossword extends SvelteComponent {
		constructor(options) {
			super();

			init(
				this,
				options,
				instance$1,
				create_fragment$1,
				safe_not_equal,
				{
					data: 26,
					actions: 0,
					theme: 27,
					revealDuration: 1,
					breakpoint: 28,
					revealed: 25,
					disableHighlight: 29,
					showCompleteMessage: 2,
					showConfetti: 3,
					showKeyboard: 4,
					keyboardStyle: 5
				},
				null,
				[-1, -1]
			);
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

	/* App.svelte generated by Svelte v4.2.20 */

	function create_toolbar_slot(ctx) {
		let div;
		let button0;
		let textContent = "clear puzzle";
		let t1;
		let button1;
		let textContent_1 = "show answers";
		let mounted;
		let dispose;

		return {
			c() {
				div = element("div");
				button0 = element("button");
				button0.textContent = textContent;
				t1 = space();
				button1 = element("button");
				button1.textContent = textContent_1;
				this.h();
			},
			l(nodes) {
				div = claim_element(nodes, "DIV", { class: true, slot: true, style: true });
				var div_nodes = children(div);

				button0 = claim_element(div_nodes, "BUTTON", {
					style: true,
					class: true,
					["data-svelte-h"]: true
				});

				if (get_svelte_dataset(button0) !== "svelte-39zpen") button0.textContent = textContent;
				t1 = claim_space(div_nodes);

				button1 = claim_element(div_nodes, "BUTTON", {
					style: true,
					class: true,
					["data-svelte-h"]: true
				});

				if (get_svelte_dataset(button1) !== "svelte-1nj8c2k") button1.textContent = textContent_1;
				div_nodes.forEach(detach);
				this.h();
			},
			h() {
				set_style(button0, "font-size", "1.5em");
				set_style(button0, "background-color", "#888");
				attr(button0, "class", "svelte-18on4kq");
				set_style(button1, "font-size", "1.5em");
				set_style(button1, "background-color", "#888");
				attr(button1, "class", "svelte-18on4kq");
				attr(div, "class", "toolbar");
				attr(div, "slot", "toolbar");
				set_style(div, "background", "#333");
				set_style(div, "padding", "1em");
				set_style(div, "margin", "1em 0");
			},
			m(target, anchor) {
				insert_hydration(target, div, anchor);
				append_hydration(div, button0);
				append_hydration(div, t1);
				append_hydration(div, button1);

				if (!mounted) {
					dispose = [
						listen(button0, "click", function () {
							if (is_function(/*onClear*/ ctx[5])) /*onClear*/ ctx[5].apply(this, arguments);
						}),
						listen(button1, "click", function () {
							if (is_function(/*onReveal*/ ctx[4])) /*onReveal*/ ctx[4].apply(this, arguments);
						})
					];

					mounted = true;
				}
			},
			p(new_ctx, dirty) {
				ctx = new_ctx;
			},
			d(detaching) {
				if (detaching) {
					detach(div);
				}

				mounted = false;
				run_all(dispose);
			}
		};
	}

	// (112:6) 
	function create_message_slot(ctx) {
		let div;
		let textContent = `<h3>OMG, congrats!</h3> <img alt="celebration" src="https://media3.giphy.com/media/QpOZPQQ2wbjOM/giphy.gif"/>`;

		return {
			c() {
				div = element("div");
				div.innerHTML = textContent;
				this.h();
			},
			l(nodes) {
				div = claim_element(nodes, "DIV", { slot: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(div) !== "svelte-ejmh7k") div.innerHTML = textContent;
				this.h();
			},
			h() {
				attr(div, "slot", "message");
			},
			m(target, anchor) {
				insert_hydration(target, div, anchor);
			},
			p: noop,
			d(detaching) {
				if (detaching) {
					detach(div);
				}
			}
		};
	}

	function create_fragment(ctx) {
		let article;
		let div0;

		let textContent = `<h1 class="svelte-18on4kq">svelte-crossword</h1> <p class="svelte-18on4kq">A crossword component for
      <a href="https://svelte.dev">Svelte</a>. Read the docs on
      <a href="https://github.com/russellsamora/svelte-crossword#svelte-crossword">Github</a>. Made with ☕ by
      <a href="https://twitter.com/wattenberger">Amelia Wattenberger</a>
      and
      <a href="https://twitter.com/russellviz">Russell Samora</a>.</p>`;

		let t11;
		let section0;
		let div1;

		let textContent_1 = `<h2 class="svelte-18on4kq"><a href="#default" class="svelte-18on4kq">Default Example</a></h2> <p class="svelte-18on4kq">A
        <a href="https://www.nytimes.com/crosswords/game/daily/2020/10/21" class="svelte-18on4kq">NYT daily</a>
        puzzle with all default settings.</p>`;

		let t17;
		let crossword0;
		let t18;
		let section1;
		let div2;

		let textContent_2 = `<h2 class="svelte-18on4kq"><a href="#mobile" class="svelte-18on4kq">Mobile</a></h2> <p class="svelte-18on4kq">A
        <a href="https://www.nytimes.com/crosswords/game/mini/2020/10/21" class="svelte-18on4kq">NYT mini</a>
        puzzle with all default settings and forced mobile view.</p>`;

		let t24;
		let crossword1;
		let t25;
		let section2;
		let div3;
		let h22;
		let textContent_3 = `<a href="#themes" class="svelte-18on4kq">Themes</a>`;
		let t27;
		let p3;
		let textContent_4 = "A library of preset style themes to choose from.";
		let t29;
		let select;
		let option0;
		let textContent_5 = "Classic";
		let option1;
		let textContent_6 = "Dark";
		let option2;
		let textContent_7 = "Citrus";
		let option3;
		let textContent_8 = "Amelia";
		let t34;
		let div4;
		let crossword2;
		let section2_class_value;
		let t35;
		let section3;
		let div5;

		let textContent_9 = `<h2 class="svelte-18on4kq"><a href="#simple" class="svelte-18on4kq">Simple Customization</a></h2> <p class="svelte-18on4kq">A few customizations: custom class names on clues/cells,
        <code class="svelte-18on4kq">revealed</code>
        binding (apply custom style), and
        <code class="svelte-18on4kq">disableHighlight</code>
        parameter.</p>`;

		let t43;
		let crossword3;
		let updating_revealed;
		let t44;
		let section4;
		let div6;
		let textContent_10 = `<h2 class="svelte-18on4kq"><a href="#slots" class="svelte-18on4kq">Slots</a></h2> <p class="svelte-18on4kq">Custom slots for the toolbar and completion message.</p>`;
		let t48;
		let crossword4;
		let current;
		let mounted;
		let dispose;
		crossword0 = new Crossword({ props: { data: dataNYTDaily } });

		crossword1 = new Crossword({
				props: { data: dataNYTMini, showKeyboard: true }
			});

		crossword2 = new Crossword({
				props: { data: dataOreo, theme: /*theme*/ ctx[1] }
			});

		function crossword3_revealed_binding(value) {
			/*crossword3_revealed_binding*/ ctx[3](value);
		}

		let crossword3_props = {
			data: dataUSA,
			disableHighlight: /*revealedUSA*/ ctx[0]
		};

		if (/*revealedUSA*/ ctx[0] !== void 0) {
			crossword3_props.revealed = /*revealedUSA*/ ctx[0];
		}

		crossword3 = new Crossword({ props: crossword3_props });
		binding_callbacks.push(() => bind(crossword3, 'revealed', crossword3_revealed_binding));

		crossword4 = new Crossword({
				props: {
					data: dataNYTDaily,
					$$slots: {
						message: [create_message_slot],
						toolbar: [
							create_toolbar_slot,
							({ onReveal, onClear }) => ({ 4: onReveal, 5: onClear }),
							({ onReveal, onClear }) => (onReveal ? 16 : 0) | (onClear ? 32 : 0)
						]
					},
					$$scope: { ctx }
				}
			});

		return {
			c() {
				article = element("article");
				div0 = element("div");
				div0.innerHTML = textContent;
				t11 = space();
				section0 = element("section");
				div1 = element("div");
				div1.innerHTML = textContent_1;
				t17 = space();
				create_component(crossword0.$$.fragment);
				t18 = space();
				section1 = element("section");
				div2 = element("div");
				div2.innerHTML = textContent_2;
				t24 = space();
				create_component(crossword1.$$.fragment);
				t25 = space();
				section2 = element("section");
				div3 = element("div");
				h22 = element("h2");
				h22.innerHTML = textContent_3;
				t27 = space();
				p3 = element("p");
				p3.textContent = textContent_4;
				t29 = space();
				select = element("select");
				option0 = element("option");
				option0.textContent = textContent_5;
				option1 = element("option");
				option1.textContent = textContent_6;
				option2 = element("option");
				option2.textContent = textContent_7;
				option3 = element("option");
				option3.textContent = textContent_8;
				t34 = space();
				div4 = element("div");
				create_component(crossword2.$$.fragment);
				t35 = space();
				section3 = element("section");
				div5 = element("div");
				div5.innerHTML = textContent_9;
				t43 = space();
				create_component(crossword3.$$.fragment);
				t44 = space();
				section4 = element("section");
				div6 = element("div");
				div6.innerHTML = textContent_10;
				t48 = space();
				create_component(crossword4.$$.fragment);
				this.h();
			},
			l(nodes) {
				article = claim_element(nodes, "ARTICLE", { class: true });
				var article_nodes = children(article);
				div0 = claim_element(article_nodes, "DIV", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(div0) !== "svelte-1a98z1q") div0.innerHTML = textContent;
				t11 = claim_space(article_nodes);
				section0 = claim_element(article_nodes, "SECTION", { id: true, class: true });
				var section0_nodes = children(section0);
				div1 = claim_element(section0_nodes, "DIV", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(div1) !== "svelte-2ok51i") div1.innerHTML = textContent_1;
				t17 = claim_space(section0_nodes);
				claim_component(crossword0.$$.fragment, section0_nodes);
				section0_nodes.forEach(detach);
				t18 = claim_space(article_nodes);
				section1 = claim_element(article_nodes, "SECTION", { id: true, style: true, class: true });
				var section1_nodes = children(section1);
				div2 = claim_element(section1_nodes, "DIV", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(div2) !== "svelte-7yef53") div2.innerHTML = textContent_2;
				t24 = claim_space(section1_nodes);
				claim_component(crossword1.$$.fragment, section1_nodes);
				section1_nodes.forEach(detach);
				t25 = claim_space(article_nodes);
				section2 = claim_element(article_nodes, "SECTION", { id: true, class: true, style: true });
				var section2_nodes = children(section2);
				div3 = claim_element(section2_nodes, "DIV", { class: true });
				var div3_nodes = children(div3);
				h22 = claim_element(div3_nodes, "H2", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(h22) !== "svelte-1b4akog") h22.innerHTML = textContent_3;
				t27 = claim_space(div3_nodes);
				p3 = claim_element(div3_nodes, "P", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(p3) !== "svelte-2n21mz") p3.textContent = textContent_4;
				t29 = claim_space(div3_nodes);
				select = claim_element(div3_nodes, "SELECT", {});
				var select_nodes = children(select);
				option0 = claim_element(select_nodes, "OPTION", { ["data-svelte-h"]: true });
				if (get_svelte_dataset(option0) !== "svelte-1ja9xse") option0.textContent = textContent_5;
				option1 = claim_element(select_nodes, "OPTION", { ["data-svelte-h"]: true });
				if (get_svelte_dataset(option1) !== "svelte-6c4gk6") option1.textContent = textContent_6;
				option2 = claim_element(select_nodes, "OPTION", { ["data-svelte-h"]: true });
				if (get_svelte_dataset(option2) !== "svelte-t1knly") option2.textContent = textContent_7;
				option3 = claim_element(select_nodes, "OPTION", { ["data-svelte-h"]: true });
				if (get_svelte_dataset(option3) !== "svelte-1ftv2cq") option3.textContent = textContent_8;
				select_nodes.forEach(detach);
				div3_nodes.forEach(detach);
				t34 = claim_space(section2_nodes);
				div4 = claim_element(section2_nodes, "DIV", {});
				var div4_nodes = children(div4);
				claim_component(crossword2.$$.fragment, div4_nodes);
				div4_nodes.forEach(detach);
				section2_nodes.forEach(detach);
				t35 = claim_space(article_nodes);
				section3 = claim_element(article_nodes, "SECTION", { id: true, class: true });
				var section3_nodes = children(section3);
				div5 = claim_element(section3_nodes, "DIV", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(div5) !== "svelte-1mbeey7") div5.innerHTML = textContent_9;
				t43 = claim_space(section3_nodes);
				claim_component(crossword3.$$.fragment, section3_nodes);
				section3_nodes.forEach(detach);
				t44 = claim_space(article_nodes);
				section4 = claim_element(article_nodes, "SECTION", { id: true, class: true });
				var section4_nodes = children(section4);
				div6 = claim_element(section4_nodes, "DIV", { class: true, ["data-svelte-h"]: true });
				if (get_svelte_dataset(div6) !== "svelte-1cjxuf8") div6.innerHTML = textContent_10;
				t48 = claim_space(section4_nodes);
				claim_component(crossword4.$$.fragment, section4_nodes);
				section4_nodes.forEach(detach);
				article_nodes.forEach(detach);
				this.h();
			},
			h() {
				attr(div0, "class", "intro svelte-18on4kq");
				attr(div1, "class", "info svelte-18on4kq");
				attr(section0, "id", "default");
				attr(section0, "class", "svelte-18on4kq");
				attr(div2, "class", "info svelte-18on4kq");
				attr(section1, "id", "mobile");
				set_style(section1, "max-width", "500px");
				attr(section1, "class", "svelte-18on4kq");
				attr(h22, "class", "svelte-18on4kq");
				attr(p3, "class", "svelte-18on4kq");
				option0.__value = "classic";
				set_input_value(option0, option0.__value);
				option1.__value = "dark";
				set_input_value(option1, option1.__value);
				option2.__value = "citrus";
				set_input_value(option2, option2.__value);
				option3.__value = "amelia";
				set_input_value(option3, option3.__value);
				if (/*theme*/ ctx[1] === void 0) add_render_callback(() => /*select_change_handler*/ ctx[2].call(select));
				attr(div3, "class", "info svelte-18on4kq");
				attr(section2, "id", "themes");
				attr(section2, "class", section2_class_value = "" + (null_to_empty(/*theme*/ ctx[1]) + " svelte-18on4kq"));
				set_style(section2, "max-width", "760px");
				attr(div5, "class", "info svelte-18on4kq");
				attr(section3, "id", "simple-customization");
				attr(section3, "class", "svelte-18on4kq");
				toggle_class(section3, "is-revealed", /*revealedUSA*/ ctx[0]);
				attr(div6, "class", "info svelte-18on4kq");
				attr(section4, "id", "slots");
				attr(section4, "class", "svelte-18on4kq");
				attr(article, "class", "svelte-18on4kq");
			},
			m(target, anchor) {
				insert_hydration(target, article, anchor);
				append_hydration(article, div0);
				append_hydration(article, t11);
				append_hydration(article, section0);
				append_hydration(section0, div1);
				append_hydration(section0, t17);
				mount_component(crossword0, section0, null);
				append_hydration(article, t18);
				append_hydration(article, section1);
				append_hydration(section1, div2);
				append_hydration(section1, t24);
				mount_component(crossword1, section1, null);
				append_hydration(article, t25);
				append_hydration(article, section2);
				append_hydration(section2, div3);
				append_hydration(div3, h22);
				append_hydration(div3, t27);
				append_hydration(div3, p3);
				append_hydration(div3, t29);
				append_hydration(div3, select);
				append_hydration(select, option0);
				append_hydration(select, option1);
				append_hydration(select, option2);
				append_hydration(select, option3);
				select_option(select, /*theme*/ ctx[1], true);
				append_hydration(section2, t34);
				append_hydration(section2, div4);
				mount_component(crossword2, div4, null);
				append_hydration(article, t35);
				append_hydration(article, section3);
				append_hydration(section3, div5);
				append_hydration(section3, t43);
				mount_component(crossword3, section3, null);
				append_hydration(article, t44);
				append_hydration(article, section4);
				append_hydration(section4, div6);
				append_hydration(section4, t48);
				mount_component(crossword4, section4, null);
				current = true;

				if (!mounted) {
					dispose = listen(select, "change", /*select_change_handler*/ ctx[2]);
					mounted = true;
				}
			},
			p(ctx, [dirty]) {
				if (dirty & /*theme*/ 2) {
					select_option(select, /*theme*/ ctx[1]);
				}

				const crossword2_changes = {};
				if (dirty & /*theme*/ 2) crossword2_changes.theme = /*theme*/ ctx[1];
				crossword2.$set(crossword2_changes);

				if (!current || dirty & /*theme*/ 2 && section2_class_value !== (section2_class_value = "" + (null_to_empty(/*theme*/ ctx[1]) + " svelte-18on4kq"))) {
					attr(section2, "class", section2_class_value);
				}

				const crossword3_changes = {};
				if (dirty & /*revealedUSA*/ 1) crossword3_changes.disableHighlight = /*revealedUSA*/ ctx[0];

				if (!updating_revealed && dirty & /*revealedUSA*/ 1) {
					updating_revealed = true;
					crossword3_changes.revealed = /*revealedUSA*/ ctx[0];
					add_flush_callback(() => updating_revealed = false);
				}

				crossword3.$set(crossword3_changes);

				if (!current || dirty & /*revealedUSA*/ 1) {
					toggle_class(section3, "is-revealed", /*revealedUSA*/ ctx[0]);
				}

				const crossword4_changes = {};

				if (dirty & /*$$scope, onReveal, onClear*/ 112) {
					crossword4_changes.$$scope = { dirty, ctx };
				}

				crossword4.$set(crossword4_changes);
			},
			i(local) {
				if (current) return;
				transition_in(crossword0.$$.fragment, local);
				transition_in(crossword1.$$.fragment, local);
				transition_in(crossword2.$$.fragment, local);
				transition_in(crossword3.$$.fragment, local);
				transition_in(crossword4.$$.fragment, local);
				current = true;
			},
			o(local) {
				transition_out(crossword0.$$.fragment, local);
				transition_out(crossword1.$$.fragment, local);
				transition_out(crossword2.$$.fragment, local);
				transition_out(crossword3.$$.fragment, local);
				transition_out(crossword4.$$.fragment, local);
				current = false;
			},
			d(detaching) {
				if (detaching) {
					detach(article);
				}

				destroy_component(crossword0);
				destroy_component(crossword1);
				destroy_component(crossword2);
				destroy_component(crossword3);
				destroy_component(crossword4);
				mounted = false;
				dispose();
			}
		};
	}

	function instance($$self, $$props, $$invalidate) {
		let revealedUSA;
		let theme;

		function select_change_handler() {
			theme = select_value(this);
			$$invalidate(1, theme);
		}

		function crossword3_revealed_binding(value) {
			revealedUSA = value;
			$$invalidate(0, revealedUSA);
		}

		return [revealedUSA, theme, select_change_handler, crossword3_revealed_binding];
	}

	class App extends SvelteComponent {
		constructor(options) {
			super();
			init(this, options, instance, create_fragment, safe_not_equal, {});
		}
	}

	const app = new App({
		target: document.querySelector("main"),
		hydrate: true
	});

	return app;

})();
//# sourceMappingURL=bundle.js.map
