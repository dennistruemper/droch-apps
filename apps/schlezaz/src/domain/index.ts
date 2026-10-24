export const modes = [
  {
    id: "schlezaz",
    name: "SchleZaZ-Modus",
    icon: "🎬",
    subtitle: "Das Original!",
    description:
      "Spannung! Drama! Jeder Zufall kommt zweimal hintereinander. Mit echter Wartezeit!",
  },
  {
    id: "xkcd",
    name: "XKCD-Modus",
    icon: "🔬",
    subtitle: "Wissenschaftlich garantiert zufällig",
    description:
      "Immer die vierte Option. Bei weniger Optionen zählen wir einfach im Kreis weiter.",
  },
  {
    id: "standard",
    name: "Standard-Modus",
    icon: "😴",
    subtitle: "Für langweilige Menschen",
    description: "Ein echter Zufallsgenerator. Gähn. Wenigstens die Wartezeit bleibt dramatisch.",
  },
  {
    id: "shuffle",
    name: "Premium Zufallserlebnis™",
    icon: "🍎",
    subtitle: "Shuffle ohne Wiederholung",
    description:
      "Jeder unterschiedliche Wert kommt einmal dran. Dann beginnt das Premium-Erlebnis von vorn.",
  },
  {
    id: "random",
    name: "Random-Random-Modus",
    icon: "🎰",
    subtitle: "Für unentschlossene Menschen",
    description: "Sogar der Modus wird ausgelost. Zufälliger wird’s heute nicht mehr.",
  },
] as const;
export type Mode = (typeof modes)[number]["id"];
export type ConcreteMode = Exclude<Mode, "random">;
export type Memory = { repeat: string | null; unused: string[] };
export const emptyMemory = (): Memory => ({ repeat: null, unused: [] });
export function validOptions(options: readonly string[]) {
  return options.map((value) => value.trim()).filter(Boolean);
}
function index(random: number, length: number) {
  if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error("Invalid randomness");
  return Math.floor(random * length);
}
/** Effects supply entropy; all selection and sequence rules stay pure. */
export function draw(
  options: readonly string[],
  mode: Mode,
  memory: Memory,
  random: number,
  modeRandom: number,
) {
  const values = validOptions(options);
  if (values.length < 2) throw new Error("Mindestens zwei Optionen erforderlich");
  const concreteModes: ConcreteMode[] = ["xkcd", "standard", "schlezaz", "shuffle"];
  const selected =
    mode === "random" ? concreteModes[index(modeRandom, concreteModes.length)]! : mode;
  let next = memory;
  let value: string;
  switch (selected) {
    case "xkcd":
      value = values[3 % values.length]!;
      break;
    case "standard":
      value = values[index(random, values.length)]!;
      break;
    case "schlezaz":
      value = memory.repeat ?? values[index(random, values.length)]!;
      next = { ...memory, repeat: memory.repeat === null ? value : null };
      break;
    case "shuffle": {
      const remaining = memory.unused.length ? memory.unused : [...new Set(values)];
      value = remaining[index(random, remaining.length)]!;
      next = { ...memory, unused: remaining.filter((option) => option !== value) };
      break;
    }
  }
  return { value, mode: selected, memory: next };
}
