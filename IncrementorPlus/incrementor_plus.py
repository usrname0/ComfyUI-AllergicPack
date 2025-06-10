# In AllergicPack/IncrementorPlus/incrementor_plus.py

class IncrementorPlus:
    NODE_NAME = "IncrementorPlus"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("INT", {
                    "default": 0,
                    "step": 1,
                    # This enables the control after generate dropdown
                    "control_after_generate": "increment", 
                }),
                "step_size": ("INT", {
                    "default": 1,
                    "min": 1,
                    "max": 100,
                    "step": 1
                }),
                "reset_value_to": ("INT", {"default": 0}),
            }
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("value", "step_size")
    FUNCTION = "execute"
    CATEGORY = "Allergic Pack"

    def execute(self, value: int, step_size: int, reset_value_to: int):
        return (value, step_size)

# Standard mapping boilerplate
NODE_CLASS_MAPPINGS = {
    "IncrementorPlus": IncrementorPlus
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "IncrementorPlus": "Incrementor Plus (Allergic)"
}