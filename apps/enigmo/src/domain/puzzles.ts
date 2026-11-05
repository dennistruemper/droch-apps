import type { Puzzle } from "./index.ts";

// Correct letters spell ER GING RAN, an anagram of the final word GARNERING.
export const puzzles = [
  {
    code: "YMIR",
    revision: 4,
    title: "Die neun Spuren",
    introduction:
      "Eine kleine Expedition durch vertraute Welten. Wähle pro Frage eine Antwort und sammle ihren Buchstaben. Die Buchstaben stehen noch nicht in der richtigen Reihenfolge. Am Ende wartet ein Wortspiel – und danach ein Schatz.",
    finalTask:
      "Neun Buchstaben, zwei Hobbys, ein Abend: Auf dem Tisch liegen magische Karten, daneben klappern Stricknadeln. Welches neue Wort verbindet den Namen des Kartenspiels mit dem Material auf den Nadeln? Ordne deine Buchstaben neu. Gesucht ist ein englisch klingendes Wortspiel aus neun Buchstaben.",
    solution: "GARNERING",
    treasure:
      "Das Losungswort stimmt. Doch der Schatz liegt nicht im Bildschirm. Gehe mit deinem Wort zum Schatzmeister: kein Drache, kein Endboss, sondern dein vertrautes Gegenüber im gemeinsamen Alltagsabenteuer. Ihr teilt mehr als einen Spieltisch. Dort wartet dein Preis.",
    questions: [
      {
        id: "trek",
        topic: "01 / Unendliche Weiten",
        text: "Spitze Ohren, ein hochgezogener Augenbrauenbogen und ein sehr logischer Blick: Zu welchem Volk gehört Spocks Vater?",
        options: [
          { letter: "K", text: "Klingonen" },
          { letter: "E", text: "Vulkanier" },
          { letter: "S", text: "Ferengi" },
          { letter: "T", text: "Borg" },
        ],
        answer: "E",
      },
      {
        id: "galaxy",
        topic: "02 / Keine Panik",
        text: "Deep Thought hat lange nachgedacht. Welche Antwort liefert der Computer auf die große Frage nach dem Leben, dem Universum und dem ganzen Rest?",
        options: [
          { letter: "R", text: "42" },
          { letter: "B", text: "Eine Tasse Tee" },
          { letter: "M", text: "404" },
          { letter: "Z", text: "Ein Handtuch" },
        ],
        answer: "R",
      },
      {
        id: "linux",
        topic: "03 / Bitte nicht überschreiben",
        text: "Fedora Silverblue gehört zu den sogenannten unveränderlichen Linux-Systemen. Was ist die Grundidee dahinter?",
        options: [
          { letter: "O", text: "Nach der Installation gibt es keine Updates mehr." },
          {
            letter: "G",
            text: "Die Systembasis ist im normalen Betrieb schreibgeschützt; Updates ersetzen sie als zusammenhängenden Stand.",
          },
          { letter: "L", text: "Auch persönliche Dateien dürfen nie verändert werden." },
          { letter: "U", text: "Das Hintergrundbild lässt sich nur mit root-Rechten ändern." },
        ],
        answer: "G",
      },
      {
        id: "gaming",
        topic: "04 / Finger auf die Tasten",
        text: "Die rechte Hand liegt auf der Maus. Welche vier Tasten übernehmen in vielen PC-Spielen standardmäßig die Bewegung?",
        options: [
          { letter: "D", text: "STRG, ALT, ENTF, ESC" },
          { letter: "H", text: "Q, E, R, T" },
          { letter: "I", text: "W, A, S, D" },
          { letter: "F", text: "F1, F2, F3, F4" },
        ],
        answer: "I",
      },
      {
        id: "pokemon",
        topic: "05 / Geladene Stimmung",
        text: "Ein wildes Pikachu erscheint! Welchen Typ hat dieses gelbe Pokémon normalerweise?",
        options: [
          { letter: "P", text: "Feuer" },
          { letter: "N", text: "Elektro" },
          { letter: "C", text: "Pflanze" },
          { letter: "V", text: "Wasser" },
        ],
        answer: "N",
      },
      {
        id: "magic",
        topic: "06 / Noch ein Zug",
        text: "Du brauchst grünes Mana. Welches dieser Standardländer tappst du in Magic: The Gathering dafür?",
        options: [
          { letter: "W", text: "Insel" },
          { letter: "J", text: "Gebirge" },
          { letter: "G", text: "Wald" },
          { letter: "Q", text: "Ebene" },
        ],
        answer: "G",
      },
      {
        id: "printing",
        topic: "07 / Schicht für Schicht",
        text: "Das 3D-Modell ist fertig, der Filamentdrucker wartet. Welche Software zerlegt das Modell in Schichten und bereitet die Druckbahnen vor?",
        options: [
          { letter: "R", text: "Ein Slicer" },
          { letter: "X", text: "Ein Shader" },
          { letter: "B", text: "Ein Bootloader" },
          { letter: "D", text: "Ein Entpacker" },
        ],
        answer: "R",
      },
      {
        id: "ymir",
        topic: "08 / Der weiße Begleiter",
        text: "Ymir kommt von draußen: groß, weiß, haarig – und mal wieder begeistert nass. Was ist jetzt die sinnvollste Ausrüstung für den nächsten Kontakt mit ihm?",
        options: [
          { letter: "T", text: "Eine antistatische Matte fürs Mainboard" },
          { letter: "S", text: "Eine frisch gesleevte Magic-Karte" },
          { letter: "U", text: "Eine Rolle PLA im Vakuumbeutel" },
          { letter: "A", text: "Ein großes Handtuch, bevor er sich schüttelt" },
        ],
        answer: "A",
      },
      {
        id: "knitting",
        topic: "09 / Noch eine Reihe",
        text: "Heute wird weder ein Deck noch ein Linux-Kernel gebaut. Zwei Nadeln und ein langer Faden sind im Einsatz. Was entsteht beim Stricken Reihe für Reihe?",
        options: [
          { letter: "C", text: "Polygone" },
          { letter: "N", text: "Maschen" },
          { letter: "H", text: "Manapunkte" },
          { letter: "O", text: "Dateisystem-Snapshots" },
        ],
        answer: "N",
      },
    ],
  },
] as const satisfies readonly Puzzle[];
