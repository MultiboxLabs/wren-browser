// The user's first space's icon: one of the icons a space can have, or an
// emoji typed in.

import { motion } from "motion/react";
import { useState } from "react";
import { isEmoji, SPACE_ICONS } from "@/components/space-icon";
import { TextField } from "@/components/ui/text-field";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { rise, Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

export function Icon({ choices: { icon }, choose, next, back, finishing }: StepProps) {
  const [emoji, setEmoji] = useState(isEmoji(icon) ? icon : "");
  return (
    <Split
      title="Give your space an icon"
      body="Spaces keep what you do apart. Pick something that says what your first one is for."
      back={back}
      go={() => next()}
      goLabel="Continue"
      finishing={finishing}
      panelClassName="items-center"
    >
      <div role="radiogroup" aria-label="Icon" className="grid grid-cols-6 gap-3">
        {Object.entries(SPACE_ICONS).map(([id, Glyph], order) => {
          const chosen = icon === `lucide:${id}`;
          const label = id.replaceAll("-", " ");
          return (
            <Tooltip key={id} label={label}>
              <motion.button
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={label}
                // Row by row, a little after the half they are on.
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.15 + Math.floor(order / 6) * 0.04, ease: "easeOut" }}
                whileTap={{ scale: 0.92 }}
                onClick={() => choose({ icon: `lucide:${id}` })}
                className={cn(
                  "grid size-16 place-items-center rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-current/40",
                  chosen ? "bg-inverse text-on-inverse" : "bg-fill text-fg-2 hover:bg-hover hover:text-fg"
                )}
              >
                <Glyph size={26} strokeWidth={1.75} />
              </motion.button>
            </Tooltip>
          );
        })}
      </div>
      <motion.div {...rise(3)} className="mt-5 flex w-full max-w-111 items-center gap-3">
        <TextField
          value={emoji}
          onChange={(event) => {
            const text = event.target.value.trim();
            setEmoji(text);
            if (isEmoji(text)) choose({ icon: text });
          }}
          placeholder="Or type an emoji"
          aria-label="Emoji"
          className={cn("flex-1", isEmoji(emoji) && icon === emoji && "ring-2 ring-fg")}
        />
      </motion.div>
    </Split>
  );
}
