import { app } from "../../../scripts/app.js";
import { setupIncrementDefault } from "./allergic_utils.js";

app.registerExtension({
	name: "AllergicPack.IncrementorPlus",
	async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
		if (nodeData.name === "IncrementorPlus") {

			const onNodeCreated = nodeType.prototype.onNodeCreated;

			nodeType.prototype.onNodeCreated = function () {
				onNodeCreated?.apply(this, arguments);

				const node = this;

				// Reset button
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
			};

			// Set up increment default and custom step-size afterQueued behavior
			setupIncrementDefault(nodeType, "value", (controlWidget, node) => {
				const valueWidget = node.widgets.find(w => w.name === "value");
				const stepSizeWidget = node.widgets.find(w => w.name === "step_size");

				if (!valueWidget || !stepSizeWidget) return false;

				const stepSize = stepSizeWidget.value;

				if (controlWidget.value === "increment") {
					valueWidget.value += stepSize;
					return true;
				} else if (controlWidget.value === "decrement") {
					valueWidget.value -= stepSize;
					return true;
				}
				return false;
			});
		}
	},
});
