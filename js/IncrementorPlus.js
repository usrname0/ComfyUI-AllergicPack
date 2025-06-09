import { app } from "../../../scripts/app.js";

app.registerExtension({
	name: "AllergicPack.IncrementorPlus",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "IncrementorPlus") {
			
			const onNodeCreated = nodeType.prototype.onNodeCreated;

			nodeType.prototype.onNodeCreated = function () {
				onNodeCreated?.apply(this, arguments);

				// Store reference to this node for use in callbacks
				const node = this;

				// Create the button widget
				this.addWidget(
					"button", "Reset Value", "reset_button",
					() => {
						const valueWidget = node.widgets.find((w) => w.name === "value");
						const resetValueWidget = node.widgets.find((w) => w.name === "reset_value_to");
						if (valueWidget && resetValueWidget) {
							valueWidget.value = resetValueWidget.value;
						}
					}
				);

				// Set the default "control after generate" behavior to "increment"
				// and configure dynamic step size for increment/decrement operations
				setTimeout(() => {
					const valueWidget = node.widgets.find((w) => w.name === "value");
					
					if (valueWidget && valueWidget.linkedWidgets) {
						// Find the control after generate dropdown (it's a ComboWidget in linkedWidgets)
						const controlWidget = valueWidget.linkedWidgets.find(w => w.type === "combo");
						if (controlWidget) {
							controlWidget.value = "increment";
							
							// Override the afterQueued callback to use custom step size
							const originalAfterQueued = controlWidget.afterQueued;
							controlWidget.afterQueued = function() {
								// Use the stored node reference to find the step_size widget
								const stepSizeWidget = node.widgets.find((w) => w.name === "step_size");
								const stepSize = stepSizeWidget ? stepSizeWidget.value : 1;
								
								// Apply our custom increment/decrement logic
								if (controlWidget.value === "increment") {
									valueWidget.value += stepSize;
								} else if (controlWidget.value === "decrement") {
									valueWidget.value -= stepSize;
								} else {
									// For randomize and fixed, call the original behavior
									if (originalAfterQueued) {
										originalAfterQueued.call(this);
									}
								}
							};
						}
					}
				}, 100);
			};
		}
	},
});