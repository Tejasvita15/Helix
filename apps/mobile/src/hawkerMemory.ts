import type { ImageSourcePropType } from "react-native";

export type HawkerMemoryItem = {
  person: string;
  item: string;
  slug: HawkerFoodSlug;
  emoji: string;
  image?: ImageSourcePropType;
};

export type HawkerMemoryQuestionType =
  | "person_for_item"
  | "item_for_person"
  | "not_shown_item";

export type HawkerMemoryQuestion = {
  questionId: string;
  type: HawkerMemoryQuestionType;
  prompt: string;
  correctAnswer: string;
  options: string[];
  foodLabel?: string;
  foodSlug?: HawkerFoodSlug;
  foodEmoji?: string;
  foodImage?: ImageSourcePropType;
};

export type HawkerMemoryAnswer = {
  questionId: string;
  selectedAnswer: string;
  responseTimeMs: number;
};

export type HawkerMemoryResult = {
  taskId: "hawker_memory_v1";
  score: number;
  maxScore: number;
  accuracy: number;
  correctCount: number;
  incorrectCount: number;
  avgResponseTimeMs: number | null;
  flags: string[];
  summary: string;
  domain: "memory_recall";
};

export type HawkerMemoryTask = {
  taskId: "hawker_memory_v1";
  studyItems: HawkerMemoryItem[];
  questions: HawkerMemoryQuestion[];
};

const TASK_ID = "hawker_memory_v1" as const;
const DEFAULT_MEMORY_ORDER_COUNT = 4;
const DEFAULT_MEMORY_QUESTION_COUNT = 3;
const DEFAULT_MEMORY_OPTION_COUNT = 3;

type OptionCandidate = {
  id: string;
  label: string;
};

export type HawkerFoodSlug =
  | "chicken-rice"
  | "laksa"
  | "nasi-lemak"
  | "roti-prata"
  | "char-kway-teow"
  | "mee-rebus"
  | "satay"
  | "kaya-toast"
  | "kopi-o-kosong"
  | "teh-c"
  | "milo-dinosaur"
  | "ice-kachang"
  | "chendol"
  | "hokkien-mee"
  | "fishball-noodles"
  | "popiah";

export type HawkerFoodVisual = {
  label: string;
  slug: HawkerFoodSlug;
  emoji: string;
  image?: ImageSourcePropType;
};

const HAWKER_IMAGES: Record<HawkerFoodSlug, ImageSourcePropType> = {
  "chicken-rice": require("../assets/hawker/chicken-rice.png"),
  laksa: require("../assets/hawker/laksa.png"),
  "nasi-lemak": require("../assets/hawker/nasi-lemak.png"),
  "roti-prata": require("../assets/hawker/roti-prata.png"),
  "char-kway-teow": require("../assets/hawker/char-kway-teow.png"),
  "mee-rebus": require("../assets/hawker/mee-rebus.png"),
  satay: require("../assets/hawker/satay.png"),
  "kaya-toast": require("../assets/hawker/kaya-toast.png"),
  "kopi-o-kosong": require("../assets/hawker/kopi-o-kosong.png"),
  "teh-c": require("../assets/hawker/teh-c.png"),
  "milo-dinosaur": require("../assets/hawker/milo-dinosaur.png"),
  "ice-kachang": require("../assets/hawker/ice-kachang.png"),
  chendol: require("../assets/hawker/chendol.png"),
  "hokkien-mee": require("../assets/hawker/hokkien-mee.png"),
  "fishball-noodles": require("../assets/hawker/fishball-noodles.png"),
  popiah: require("../assets/hawker/popiah.png"),
};

const HAWKER_POOL: HawkerMemoryItem[] = [
  {
    person: "Auntie Mei",
    item: "Chicken Rice",
    slug: "chicken-rice",
    emoji: "🍚",
    image: HAWKER_IMAGES["chicken-rice"],
  },
  {
    person: "Uncle Rahman",
    item: "Mee Rebus",
    slug: "mee-rebus",
    emoji: "🍜",
    image: HAWKER_IMAGES["mee-rebus"],
  },
  {
    person: "Mr Tan",
    item: "Kopi-O Kosong",
    slug: "kopi-o-kosong",
    emoji: "☕",
    image: HAWKER_IMAGES["kopi-o-kosong"],
  },
  {
    person: "Mdm Lim",
    item: "Laksa",
    slug: "laksa",
    emoji: "🍲",
    image: HAWKER_IMAGES.laksa,
  },
  {
    person: "Aisha",
    item: "Roti Prata",
    slug: "roti-prata",
    emoji: "🥞",
    image: HAWKER_IMAGES["roti-prata"],
  },
  {
    person: "Daniel",
    item: "Char Kway Teow",
    slug: "char-kway-teow",
    emoji: "🍝",
    image: HAWKER_IMAGES["char-kway-teow"],
  },
  {
    person: "Siti",
    item: "Nasi Lemak",
    slug: "nasi-lemak",
    emoji: "🍛",
    image: HAWKER_IMAGES["nasi-lemak"],
  },
  {
    person: "Ben",
    item: "Satay",
    slug: "satay",
    emoji: "🍢",
    image: HAWKER_IMAGES.satay,
  },
  {
    person: "Grace",
    item: "Fishball Noodles",
    slug: "fishball-noodles",
    emoji: "🍜",
    image: HAWKER_IMAGES["fishball-noodles"],
  },
  {
    person: "Kumar",
    item: "Kaya Toast",
    slug: "kaya-toast",
    emoji: "🍞",
    image: HAWKER_IMAGES["kaya-toast"],
  },
  {
    person: "Nora",
    item: "Teh-C",
    slug: "teh-c",
    emoji: "🧋",
    image: HAWKER_IMAGES["teh-c"],
  },
  {
    person: "Marcus",
    item: "Milo Dinosaur",
    slug: "milo-dinosaur",
    emoji: "🥤",
    image: HAWKER_IMAGES["milo-dinosaur"],
  },
  {
    person: "Priya",
    item: "Ice Kachang",
    slug: "ice-kachang",
    emoji: "🍧",
    image: HAWKER_IMAGES["ice-kachang"],
  },
  {
    person: "Zhi Wei",
    item: "Chendol",
    slug: "chendol",
    emoji: "🍧",
    image: HAWKER_IMAGES.chendol,
  },
  {
    person: "Farah",
    item: "Hokkien Mee",
    slug: "hokkien-mee",
    emoji: "🍤",
    image: HAWKER_IMAGES["hokkien-mee"],
  },
  {
    person: "Ethan",
    item: "Popiah",
    slug: "popiah",
    emoji: "🌯",
    image: HAWKER_IMAGES.popiah,
  },
];

export function getHawkerFoodVisual(label: string): HawkerFoodVisual | undefined {
  const matchedItem = HAWKER_POOL.find((poolItem) => poolItem.item === label);

  if (!matchedItem) {
    return undefined;
  }

  return {
    label: matchedItem.item,
    slug: matchedItem.slug,
    emoji: matchedItem.emoji,
    image: matchedItem.image,
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function normalizeOptionLabel(label: string): string {
  return label.trim().toLocaleLowerCase();
}

function uniqueOptionCandidates(candidates: OptionCandidate[]): OptionCandidate[] {
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();

  return candidates.filter((candidate) => {
    const label = normalizeOptionLabel(candidate.label);
    if (seenIds.has(candidate.id) || seenLabels.has(label)) {
      return false;
    }
    seenIds.add(candidate.id);
    seenLabels.add(label);
    return true;
  });
}

function foodCandidate(item: HawkerMemoryItem): OptionCandidate {
  return {
    id: `food:${item.slug}`,
    label: item.item,
  };
}

function personCandidate(item: HawkerMemoryItem): OptionCandidate {
  return {
    id: `person:${normalizeOptionLabel(item.person)}`,
    label: item.person,
  };
}

function optionIdForLabel(label: string): string {
  const foodVisual = getHawkerFoodVisual(label);
  if (foodVisual) {
    return `food:${foodVisual.slug}`;
  }
  return `person:${normalizeOptionLabel(label)}`;
}

function takeDistractors(
  correctAnswer: OptionCandidate,
  candidates: OptionCandidate[],
  random: () => number,
  count = DEFAULT_MEMORY_OPTION_COUNT - 1,
): OptionCandidate[] {
  const correctLabel = normalizeOptionLabel(correctAnswer.label);
  return shuffle(uniqueOptionCandidates(candidates), random)
    .filter(
      (candidate) =>
        candidate.id !== correctAnswer.id &&
        normalizeOptionLabel(candidate.label) !== correctLabel,
    )
    .slice(0, count);
}

function makeOptions(
  correctAnswer: OptionCandidate,
  candidates: OptionCandidate[],
  random: () => number,
): string[] {
  return shuffle([correctAnswer, ...takeDistractors(correctAnswer, candidates, random)], random)
    .slice(0, DEFAULT_MEMORY_OPTION_COUNT)
    .map((candidate) => candidate.label);
}

function assertValidHawkerMemoryTask(task: HawkerMemoryTask): void {
  const shownItemLabels = new Set(
    task.studyItems.map((studyItem) => normalizeOptionLabel(studyItem.item)),
  );

  for (const question of task.questions) {
    const optionIds = question.options.map(optionIdForLabel);
    const optionLabels = question.options.map(normalizeOptionLabel);
    if (new Set(optionIds).size !== optionIds.length) {
      throw new Error(`Duplicate option ids for ${question.questionId}`);
    }
    if (new Set(optionLabels).size !== optionLabels.length) {
      throw new Error(`Duplicate option labels for ${question.questionId}`);
    }
    if (question.options.length !== DEFAULT_MEMORY_OPTION_COUNT) {
      throw new Error(`Unexpected option count for ${question.questionId}`);
    }
    if (question.type === "not_shown_item") {
      const notShownCount = question.options.filter(
        (option) => !shownItemLabels.has(normalizeOptionLabel(option)),
      ).length;
      if (
        notShownCount !== 1 ||
        shownItemLabels.has(normalizeOptionLabel(question.correctAnswer))
      ) {
        throw new Error(`Invalid not-shown options for ${question.questionId}`);
      }
    }
  }
}

export function createHawkerMemoryTask(seed = "demo-session-001"): HawkerMemoryTask {
  const random = seededRandom(seed);
  const studyItems = shuffle(HAWKER_POOL, random).slice(0, DEFAULT_MEMORY_ORDER_COUNT);
  const unseenItems = HAWKER_POOL.filter(
    (poolItem) =>
      !studyItems.some((studyItem) => studyItem.item === poolItem.item),
  );
  const people = uniqueOptionCandidates(studyItems.map(personCandidate));
  const shownItems = uniqueOptionCandidates(studyItems.map(foodCandidate));
  const notShownCandidate =
    uniqueOptionCandidates(shuffle(unseenItems, random).map(foodCandidate))[0] ?? {
      id: "food:ice-kachang",
      label: "Ice Kachang",
    };

  const baseQuestions: HawkerMemoryQuestion[] = [
    {
      questionId: "q1",
      type: "person_for_item",
      prompt: `Who ordered ${studyItems[0].item}?`,
      correctAnswer: studyItems[0].person,
      options: makeOptions(personCandidate(studyItems[0]), people, random),
      foodLabel: studyItems[0].item,
      foodSlug: studyItems[0].slug,
      foodEmoji: studyItems[0].emoji,
      foodImage: studyItems[0].image,
    },
    {
      questionId: "q2",
      type: "item_for_person",
      prompt: `What did ${studyItems[1].person} order?`,
      correctAnswer: studyItems[1].item,
      options: makeOptions(foodCandidate(studyItems[1]), shownItems, random),
    },
    {
      questionId: "q3",
      type: "not_shown_item",
      prompt: "Which item was not shown?",
      correctAnswer: notShownCandidate.label,
      options: shuffle(
        [notShownCandidate, ...shuffle(shownItems, random).slice(0, DEFAULT_MEMORY_OPTION_COUNT - 1)],
        random,
      ).map((candidate) => candidate.label),
    },
    {
      questionId: "q4",
      type: "person_for_item",
      prompt: `Who ordered ${studyItems[2].item}?`,
      correctAnswer: studyItems[2].person,
      options: makeOptions(personCandidate(studyItems[2]), people, random),
      foodLabel: studyItems[2].item,
      foodSlug: studyItems[2].slug,
      foodEmoji: studyItems[2].emoji,
      foodImage: studyItems[2].image,
    },
    {
      questionId: "q5",
      type: "item_for_person",
      prompt: `What did ${studyItems[3].person} order?`,
      correctAnswer: studyItems[3].item,
      options: makeOptions(foodCandidate(studyItems[3]), shownItems, random),
    },
  ];

  const task = {
    taskId: TASK_ID,
    studyItems,
    questions: baseQuestions.slice(0, DEFAULT_MEMORY_QUESTION_COUNT),
  };
  assertValidHawkerMemoryTask(task);
  return task;
}

export function scoreHawkerMemoryTask(
  questions: HawkerMemoryQuestion[],
  answers: HawkerMemoryAnswer[],
): HawkerMemoryResult {
  const answerById = new Map(
    answers.map((answer) => [answer.questionId, answer]),
  );
  const correctCount = questions.reduce((total, question) => {
    const answer = answerById.get(question.questionId);
    return total + (answer?.selectedAnswer === question.correctAnswer ? 1 : 0);
  }, 0);
  const maxScore = questions.length;
  const incorrectCount = maxScore - correctCount;
  const responseTimes = answers
    .map((answer) => answer.responseTimeMs)
    .filter((responseTimeMs) => responseTimeMs > 0);
  const avgResponseTimeMs =
    responseTimes.length > 0
      ? Math.round(
          responseTimes.reduce((total, responseTimeMs) => total + responseTimeMs, 0) /
            responseTimes.length,
        )
      : null;
  const accuracy = maxScore > 0 ? correctCount / maxScore : 0;
  const flags: string[] = [];

  if (accuracy < 0.6) {
    flags.push("low_accuracy");
  }

  if (avgResponseTimeMs !== null && avgResponseTimeMs < 900) {
    flags.push("very_fast_responses");
  }

  const missedAssociations = questions.filter((question) => {
    if (question.type === "not_shown_item") {
      return false;
    }
    const answer = answerById.get(question.questionId);
    return answer?.selectedAnswer !== question.correctAnswer;
  }).length;

  if (missedAssociations >= 3) {
    flags.push("many_missed_associations");
  }

  return {
    taskId: TASK_ID,
    score: correctCount,
    maxScore,
    accuracy,
    correctCount,
    incorrectCount,
    avgResponseTimeMs,
    flags,
    summary:
      accuracy >= 0.8
        ? "Good recall of the hawker orders."
        : accuracy >= 0.6
          ? "Some hawker order details were recalled; a few associations were missed."
          : "Several hawker order associations were missed in this game.",
    domain: "memory_recall",
  };
}
