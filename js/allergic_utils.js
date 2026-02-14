/**
 * Shared utilities for Allergic Pack ComfyUI extensions.
 */

/**
 * Update an output slot's display name (name, label, and localized_name).
 */
export function updateSlotName(node, index, newName) {
	if (node.outputs && node.outputs[index]) {
		const slot = node.outputs[index];
		slot.name = newName;
		slot.label = newName;
		if (slot.hasOwnProperty("localized_name")) {
			slot.localized_name = newName;
		}
	}
}

/**
 * Set up the "control after generate" dropdown to default to "increment"
 * for newly created nodes (not loaded from workflows).
 *
 * Also installs a configure() override to detect workflow loads via
 * node._isFromWorkflow.
 *
 * @param {object} nodeType - The node type prototype object.
 * @param {string} widgetName - Name of the INT widget with control_after_generate.
 * @param {function} [afterQueuedOverride] - Optional replacement for the
 *     control widget's afterQueued callback. Receives (controlWidget, node)
 *     as arguments and should handle "increment"/"decrement" cases itself,
 *     returning true if handled or false to fall through to original behavior.
 */
export function setupIncrementDefault(nodeType, widgetName, afterQueuedOverride) {
	const patchOnNodeCreated = function (existingFn) {
		return function () {
			existingFn?.apply(this, arguments);

			const node = this;
			node._isFromWorkflow = false;

			setTimeout(() => {
				const targetWidget = node.widgets.find((w) => w.name === widgetName);

				if (targetWidget && targetWidget.linkedWidgets) {
					const controlWidget = targetWidget.linkedWidgets.find((w) => w.type === "combo");
					if (controlWidget) {
						// Default to "increment" for new nodes only
						if (!node._isFromWorkflow) {
							const setIncrement = () => {
								if (controlWidget.value === "randomize" || controlWidget.value === "fixed" || !controlWidget.value) {
									controlWidget.value = "increment";
								}
							};
							setIncrement();
							setTimeout(setIncrement, 50);
							setTimeout(setIncrement, 200);
						}

						// Install custom afterQueued if provided
						if (afterQueuedOverride) {
							const originalAfterQueued = controlWidget.afterQueued;
							controlWidget.afterQueued = function () {
								const handled = afterQueuedOverride(controlWidget, node);
								if (!handled && originalAfterQueued) {
									originalAfterQueued.call(this);
								}
							};
						}
					}
				}
			}, 100);
		};
	};

	// Patch the current onNodeCreated
	nodeType.prototype.onNodeCreated = patchOnNodeCreated(nodeType.prototype.onNodeCreated);

	// Configure override to detect workflow loads
	const originalConfigure = nodeType.prototype.configure;
	nodeType.prototype.configure = function (info) {
		this._isFromWorkflow = true;
		if (originalConfigure) {
			originalConfigure.call(this, info);
		}
	};
}
