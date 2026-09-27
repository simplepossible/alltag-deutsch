/** One A1 scene: five lines, three checks. The first option is the correct one. */
export function scene({ id, title, deTitle, place, goal, canDo, register, lines, checks }) {
  return {
    id,
    level: 1,
    title,
    deTitle,
    place,
    goal,
    canDo,
    register,
    phrases: lines.map(([speaker, kind, de, en, tip], index) => ({
      id: `${id}-${index + 1}`,
      speaker,
      kind,
      de,
      en,
      tip,
    })),
    checks: checks.map(([line, prompt, correct, wrongA, wrongB, why], index) => ({
      id: `${id}-c${index + 1}`,
      phraseId: `${id}-${line}`,
      prompt,
      why,
      options: [
        { text: correct, correct: true },
        { text: wrongA, correct: false },
        { text: wrongB, correct: false },
      ],
    })),
  };
}
