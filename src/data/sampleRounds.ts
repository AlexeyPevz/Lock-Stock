import { RoundBundle } from "../types";

// NOTE: Placeholder demo content with verifiable-ish trivia. Replace with real pipeline later.
export const sampleRounds: RoundBundle[] = [
  {
    number: 79,
    question: {
      id: "q-79",
      number: 79,
      domain: "science",
      text: "У какого химического элемента атомный номер равен этому числу?",
      sourceUrl: "https://en.wikipedia.org/wiki/List_of_chemical_elements",
    },
    hint1: {
      id: "h1-79",
      number: 79,
      domain: "history",
      text: "Стандарт олимпийского золота — это сплав, но номер элемента чистого золота равен этому числу.",
      sourceUrl: "https://en.wikipedia.org/wiki/Gold",
    },
    hint2: {
      id: "h2-79",
      number: 79,
      domain: "pop_culture",
      text: "В игре про пиратов часто ищут именно этот благородный металл.",
    },
  },
  {
    number: 206,
    question: {
      id: "q-206",
      number: 206,
      domain: "science",
      text: "Сколько костей у взрослого человека в среднем?",
      sourceUrl: "https://en.wikipedia.org/wiki/Bone",
    },
    hint1: {
      id: "h1-206",
      number: 206,
      domain: "sports",
      text: "В хоккее защитники надевают экипировку, чтобы беречь их количество…",
    },
    hint2: {
      id: "h2-206",
      number: 206,
      domain: "movies",
      text: "В медицинских драмах студенты анатомии зубрят именно это число.",
    },
  },
  {
    number: 12,
    question: {
      id: "q-12",
      number: 12,
      domain: "geography",
      text: "Сколько месяцев в году в григорианском календаре?",
      sourceUrl: "https://en.wikipedia.org/wiki/Gregorian_calendar",
    },
    hint1: {
      id: "h1-12",
      number: 12,
      domain: "history",
      text: "Столько подвигов приписывают Гераклу в мифах.",
    },
    hint2: {
      id: "h2-12",
      number: 12,
      domain: "music",
      text: "В западной музыкальной традиции тонов в равномерно темперированном строе — именно столько.",
    },
  },
  {
    number: 88,
    question: {
      id: "q-88",
      number: 88,
      domain: "music",
      text: "Сколько клавиш стандартного фортепиано?",
      sourceUrl: "https://en.wikipedia.org/wiki/Piano",
    },
    hint1: {
      id: "h1-88",
      number: 88,
      domain: "movies",
      text: "В культовой трилогии для путешествия во времени нужна скорость именно в миль/ч с этим числом.",
      sourceUrl: "https://en.wikipedia.org/wiki/Back_to_the_Future",
    },
    hint2: {
      id: "h2-88",
      number: 88,
      domain: "other",
      text: "Дважды 44 — тоже подсказка, если вспомнить оркестровые инструменты.",
    },
  },
  {
    number: 42,
    question: {
      id: "q-42",
      number: 42,
      domain: "other",
      text: "Какое число названо ответом на главный вопрос жизни, вселенной и всего такого?",
      sourceUrl: "https://en.wikipedia.org/wiki/42_(number)",
    },
    hint1: {
      id: "h1-42",
      number: 42,
      domain: "movies",
      text: "Это шутливая отсылка из произведений Дугласа Адамса.",
    },
    hint2: {
      id: "h2-42",
      number: 42,
      domain: "science",
      text: "Число встречается в статистике и нумерологических мемах, но нам важно именно популярное цитирование.",
    },
  },
];