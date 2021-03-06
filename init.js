(() => {
	/**
	 * @enum {number}
	 */
	const ModuleState = {
		Unprocessed: 0,
		Waiting: 1,
		Processed: 2,
		Error: 3,
	};

	/**
	 * @typedef {(getModule: (module: string) => any, module: Module, ...args: any[]) => any} ModuleInitializer
	 */

	/**
	 * @typedef {{ _name: string; _state: ModuleState; _requirements: string[]; _initializer: ModuleInitializer; _error?: Error  }} Module
	 */

	/**
	 * @type {Map<string, Module>}
	 */
	const moduleMap = new Map();
	/**
	 * @type {Set<string>}
	 */
	const requirements = new Set();

	/**
	 * @param {string} name
	 * @param {string[]} reqs
	 * @param {ModuleInitializer} fn
	 */
	function define (name, reqs, fn) {
		if (moduleMap.has(name))
			throw new Error(`Module "${name}" cannot be redefined`);

		/**
		 * @type {Module}
		 */
		const module = {
			_name: name,
			_state: ModuleState.Unprocessed,
			_requirements: reqs.slice(2).map(req => req),
			_initializer: fn,
		};
		moduleMap.set(name, module);
		for (const req of module._requirements)
			requirements.add(req);

		if (initialProcessCompleted)
			processModules();
	}

	/**
	 * @param {string} name
	 */
	function getModule (name) {
		return moduleMap.get(name);
	}

	/**
	 * @param {string} name
	 */
	function initializeModuleByName (name) {
		initializeModule(getModule(name));
	}

	/**
	 * @param {Module} module 
	 * @param  {...any} args 
	 */
	function initializeModule (module, ...args) {
		if (module._state)
			throw new Error(`Module "${module._name}" has already been processed`);

		try {
			module._initializer(getModule, module, ...args);
			module._state = ModuleState.Processed;

		} catch (err) {
			module._state = ModuleState.Error;
			module._error = err;
			err.message = `[Module initialization ${module._name}] ${err.message}`;
			console.error(err);
		}
	}


	////////////////////////////////////
	// Add the above functions to Window
	//

	/** 
	 * @type {Window & typeof globalThis & { define: typeof define; getModule: typeof getModule; initializeModule: typeof initializeModuleByName }} 
	 */
	const moddableWindow = (window);
	moddableWindow.define = define;
	moddableWindow.getModule = getModule;
	moddableWindow.initializeModule = initializeModuleByName;


	////////////////////////////////////
	// Actually process the modules
	//

	document.addEventListener("DOMContentLoaded", processModules);

	let initialProcessCompleted = false;
	async function processModules () {
		for (const [name, module] of moduleMap.entries())
			processModule(name, module);

		initialProcessCompleted = true;
	}

	/**
	 * @param {string} req
	 */
	async function importAdditionalModule (req) {
		const script = document.createElement("script");
		document.head.appendChild(script);
		/** @type {Promise<void>} */
		const promise = new Promise(resolve => script.addEventListener("load", () => resolve()));
		script.src = `/js/${req}.js`;
		return promise;
	}

	/**
	 * @param {string} name 
	 * @param {Module | undefined} module 
	 * @param {string[]} requiredBy 
	 */
	function processModule (name, module = moduleMap.get(name), requiredBy = []) {
		if (!module)
			throw new Error(`No "${name}" module defined`);

		if (module._state === ModuleState.Waiting)
			throw new Error(`Circular dependency! Dependency chain: ${[...requiredBy, name].map(m => `"${m}"`).join(" > ")}`);

		if (!module._state) {
			module._state = ModuleState.Waiting;
			const args = module._requirements
				.map(req => processModule(req, undefined, [...requiredBy, name]));

			module._state = ModuleState.Unprocessed;
			initializeModule(module, ...args);
		}

		return module;
	}
})();
