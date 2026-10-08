import type { TileSet } from "../contracts/index.ts";
const make = (name: string, values: string): TileSet => ({
  name,
  tiles: values.split(" ").map((value) => {
    const [letter, count, points] = value.split(":");
    return { letter: letter!, count: Number(count), points: Number(points) };
  }),
});
// Vortoj defaults use small distribution adjustments for each language.
export const presets = [
  {
    id: "english",
    ...make(
      "English",
      "A:9:1 B:2:3 C:2:3 D:4:2 E:11:1 F:2:4 G:3:2 H:2:4 I:8:1 J:1:8 K:1:5 L:4:1 M:2:3 N:6:1 O:8:1 P:2:3 Q:1:10 R:6:1 S:5:1 T:7:1 U:4:1 V:2:4 W:2:4 X:1:8 Y:2:4 Z:1:10 *:2:0",
    ),
  },
  {
    id: "german",
    ...make(
      "German",
      "A:5:1 B:2:3 C:2:4 D:4:1 E:14:1 F:2:4 G:3:2 H:4:2 I:6:1 J:1:6 K:2:4 L:3:2 M:4:3 N:8:1 O:3:2 P:1:4 Q:1:10 R:6:1 S:8:1 T:6:1 U:5:1 V:1:6 W:1:3 X:1:8 Y:1:10 Z:1:3 Ä:1:6 Ö:1:8 Ü:1:6 *:2:0",
    ),
  },
];
