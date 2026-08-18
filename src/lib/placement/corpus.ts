// Curated knowledge base for the placement exam pipeline.
//
// The Web Search Agent prefers LIVE sources (Serper API, then Gemini's
// googleSearch grounding). This corpus is the deterministic floor: when no
// search backend is configured, the pipeline still produces a working paper
// from these verified-flavoured question sets, and the sources list honestly
// says the corpus was used.
//
// Questions here are classic placement-preparation material (widely published
// aptitude/PYQ-style items) with answers reviewed by hand. They are seed data
// for a hackathon reconstruction — see the legal note in docs/AGENT-RULES.md.

import type { ExamPattern, ExamQuestion } from "./types";

export interface CorpusExam {
  aliases: string[];
  pattern: ExamPattern;
  questions: ExamQuestion[];
  notes: string[];
}

function q(
  topic: string,
  questionText: string,
  options: string[],
  answer: number,
  difficulty: ExamQuestion["difficulty"],
  explanation?: string
): ExamQuestion {
  return { topic, questionText, options, answer, difficulty, explanation, source: "seed corpus", sourceType: "seed" };
}

export const EXAM_CORPUS: CorpusExam[] = [
  // =========================================================================
  // TCS NQT
  // =========================================================================
  {
    aliases: ["tcs nqt", "tcs ninja", "tcs national qualifier test", "tcs"],
    pattern: {
      examName: "TCS NQT",
      durationMinutes: 120,
      totalQuestions: 60,
      negativeMarking: 0,
      markingScheme: { perQuestion: 1, negativePerWrong: 0 },
      sections: [
        { name: "Numerical Ability", topics: ["Arithmetic", "Algebra", "Geometry", "Number Systems"], questionCount: 20, marksPerQuestion: 1 },
        { name: "Reasoning Ability", topics: ["Logical Reasoning", "Data Interpretation", "Puzzles"], questionCount: 15, marksPerQuestion: 1 },
        { name: "Verbal Ability", topics: ["Grammar", "Vocabulary", "Reading Comprehension"], questionCount: 15, marksPerQuestion: 1 },
        { name: "Programming Logic", topics: ["Pseudocode", "Data Structures", "Output Prediction"], questionCount: 10, marksPerQuestion: 1 },
      ],
      notes: [
        "No negative marking in the foundational test.",
        "Sectional time limits are enforced in the real exam.",
        "Programming section is pseudocode/flowchart based, not language-specific.",
      ],
    },
    questions: [
      q("Arithmetic", "A train 120 m long passes a pole in 12 seconds. What is its speed in km/h?", ["30", "36", "40", "48"], 1, "easy", "Speed = distance/time = 120/12 = 10 m/s = 10 × 18/5 = 36 km/h."),
      q("Arithmetic", "The average of 5 consecutive odd numbers is 25. What is the largest number?", ["27", "29", "31", "33"], 1, "medium", "Middle of 5 consecutive odds = average = 25, so numbers are 21,23,25,27,29 → largest 29."),
      q("Arithmetic", "A shopkeeper marks an item 25% above cost and gives a 10% discount. His profit percentage is:", ["10%", "12.5%", "15%", "20%"], 1, "medium", "Let CP = 100. MP = 125. SP = 125 × 0.9 = 112.5 → profit 12.5%."),
      q("Arithmetic", "In how many years will a sum of money double at 8% simple interest per annum?", ["10", "12.5", "15", "20"], 1, "easy", "SI = P → P × 8 × t / 100 = P → t = 12.5 years."),
      q("Arithmetic", "A boat travels 40 km downstream in 4 hours and 40 km upstream in 8 hours. The speed of the stream is:", ["2.5 km/h", "3 km/h", "4 km/h", "5 km/h"], 0, "hard", "Downstream = 10, upstream = 5. Stream = (10−5)/2 = 2.5 km/h."),
      q("Algebra", "If x + 1/x = 4, then x² + 1/x² equals:", ["14", "16", "18", "20"], 0, "medium", "x² + 1/x² = (x + 1/x)² − 2 = 16 − 2 = 14."),
      q("Algebra", "The sum of the digits of a two-digit number is 9. If 27 is added, the digits reverse. The number is:", ["36", "45", "54", "63"], 0, "hard", "10a+b with a+b=9; 10a+b+27 = 10b+a → 9(a−b) = −27 → b−a=3; a+b=9 → a=3,b=6 → 36."),
      q("Algebra", "If the roots of x² − 7x + k = 0 are equal, then k = ?", ["12.25", "14", "49", "7"], 0, "medium", "Discriminant zero → 49 − 4k = 0 → k = 12.25."),
      q("Geometry", "The area of a circle whose circumference is 44 cm is:", ["154 cm²", "176 cm²", "196 cm²", "308 cm²"], 0, "medium", "2πr = 44 → r = 7. Area = πr² = 154."),
      q("Geometry", "The angle between the hands of a clock at 3:30 is:", ["60°", "75°", "90°", "105°"], 1, "hard", "Hour hand: 3.5 × 30 = 105°, minute: 30 × 6 = 180° → diff 75°."),
      q("Number Systems", "What is the remainder when 3^100 is divided by 5?", ["0", "1", "2", "3"], 1, "hard", "3^n cycles 3,4,2,1 mod 5; 100 ≡ 0 mod 4 → remainder 1."),
      q("Number Systems", "The LCM of 24, 36 and 40 is:", ["120", "240", "360", "480"], 2, "easy", "24=2³·3, 36=2²·3², 40=2³·5 → LCM = 2³·3²·5 = 360."),
      q("Number Systems", "How many numbers between 100 and 200 are divisible by 7?", ["13", "14", "15", "16"], 1, "easy", "105 to 196 → (196−105)/7 + 1 = 14."),
      q("Number Systems", "A number when divided by 5, 6 and 7 leaves remainder 1 in each case. The smallest such number is:", ["210", "211", "221", "421"], 1, "hard", "LCM(5,6,7)=210, +1 = 211."),
      q("Arithmetic", "A man spends 60% of his salary. If his salary increases by 20% but spending stays the same, savings increase by:", ["20%", "30%", "40%", "50%"], 3, "hard", "S = 40. New salary 120, savings 60 → increase 20/40 = 50%."),
      q("Arithmetic", "Two pipes fill a tank in 12 and 18 hours respectively. A drain empties it in 36 hours. All three open together fill it in:", ["9 h", "10 h", "11 h", "12 h"], 0, "medium", "1/12 + 1/18 − 1/36 = (3+2−1)/36 = 4/36 → 9 h."),
      q("Arithmetic", "A sum of ₹8,000 at compound interest (annual) becomes ₹9,680 in 2 years. The rate is:", ["8%", "10%", "11%", "12%"], 1, "hard", "9680/8000 = 1.21 → 1.21 = (1+r)² → r = 10%."),
      q("Arithmetic", "If 15 men can build a wall in 24 days, how many days will 12 men take for the same work?", ["28", "30", "32", "36"], 1, "easy", "15×24/12 = 30 days."),
      q("Arithmetic", "The simple interest on ₹4,000 at 6% p.a. for 3 years is:", ["₹600", "₹640", "₹700", "₹720"], 3, "easy", "4000 × 6 × 3 / 100 = 720."),
      q("Arithmetic", "In a class of 40 students, 60% are boys. The average weight of boys is 45 kg and of girls is 40 kg. Class average is:", ["42.4", "42.8", "43.0", "43.2"], 2, "medium", "(24×45 + 16×40)/40 = (1080+640)/40 = 43.0."),
      q("Logical Reasoning", "In a row of students, Ravi is 12th from the left and 9th from the right. How many students are in the row?", ["19", "20", "21", "22"], 1, "easy", "12 + 9 − 1 = 20."),
      q("Logical Reasoning", "In a code where A=1, B=2, C=3, … Z=26, what is the code for the word 'BIRD'?", ["29184", "29185", "28184", "29194"], 0, "hard", "Letter positions: B=2, I=9, R=18, D=4 → 29184."),
      q("Logical Reasoning", "Pointing to a photograph, a man says, 'She is the daughter of my grandfather's only son.' How is the woman related to the man?", ["Sister", "Daughter", "Cousin", "Niece"], 0, "medium", "Grandfather's only son = father; his daughter = sister."),
      q("Logical Reasoning", "Complete the series: 3, 7, 15, 31, 63, ?", ["125", "127", "129", "131"], 1, "easy", "×2+1 each time → 127."),
      q("Data Interpretation", "A shop sells 200 units at ₹50 each. 25% were sold at a 10% discount. Total revenue is:", ["₹9,500", "₹9,750", "₹10,000", "₹9,250"], 1, "medium", "150×50 + 50×45 = 7500 + 2250 = 9750."),
      q("Puzzles", "A, B, C, D are sitting in a row. A sits left of B but right of D. C sits right of B. Who sits in the middle?", ["A", "B", "C", "D"], 1, "medium", "Order: D, A, B, C → B is in the middle."),
      q("Logical Reasoning", "If 20% of x = 30% of y, then x : y = ?", ["2:3", "3:2", "3:5", "5:3"], 1, "easy", "0.2x = 0.3y → x/y = 3/2."),
      q("Puzzles", "A cube is painted red on all faces and cut into 125 equal smaller cubes. How many small cubes have exactly two red faces?", ["36", "44", "48", "54"], 0, "hard", "Edge cubes minus corners: 12 edges × 3 = 36."),
      q("Logical Reasoning", "Statements: All pens are pencils. Some pencils are erasers. Conclusion: Some pens are erasers. The conclusion:", ["Follows", "Does not follow", "Follows partially", "Cannot be determined"], 1, "medium", "The overlap could be between erasers and the non-pen pencils only."),
      q("Data Interpretation", "A pie chart shows 40% of students prefer CSE, 25% ECE, 20% Mechanical, rest Civil. If total is 800, how many prefer Civil?", ["100", "120", "140", "160"], 1, "easy", "15% of 800 = 120."),
      q("Logical Reasoning", "Find the odd one out: 121, 144, 169, 196, 215", ["121", "144", "169", "215"], 3, "easy", "All others are perfect squares; 215 is not."),
      q("Logical Reasoning", "Today is Monday. What day will it be after 61 days?", ["Saturday", "Sunday", "Monday", "Tuesday"], 0, "medium", "61 mod 7 = 5 → Monday + 5 = Saturday."),
      q("Puzzles", "A clock shows 4:20. What is the angle between the hands?", ["5°", "10°", "15°", "20°"], 1, "hard", "Hour: 4×30 + 20×0.5 = 130; minute: 120 → 10°."),
      q("Logical Reasoning", "If P means ×, Q means ÷, R means +, S means −, then 8 P 4 Q 2 R 3 S 1 = ?", ["14", "16", "18", "20"], 2, "easy", "8×4÷2+3−1 = 16+3−1 = 18."),
      q("Verbal", "Choose the synonym of 'Meticulous':", ["Careful", "Careless", "Quick", "Sloppy"], 0, "easy", "Meticulous = extremely careful."),
      q("Verbal", "Choose the antonym of 'Ephemeral':", ["Short-lived", "Permanent", "Temporary", "Fleeting"], 1, "easy", "Ephemeral = lasting a very short time; opposite = permanent."),
      q("Verbal", "Select the correct sentence:", ["He is better than me.", "He is better than I.", "He is best than I.", "He is more better than me."], 1, "medium", "Comparative 'better' takes the subject form 'I' (than I am)."),
      q("Verbal", "Fill in the blank: The committee _______ divided in its opinion.", ["are", "is", "were", "have"], 1, "medium", "The committee (as a body) is divided."),
      q("Verbal", "Choose the word closest in meaning to 'Ubiquitous':", ["Rare", "Everywhere", "Hidden", "Distant"], 1, "medium", "Ubiquitous = present everywhere."),
      q("Verbal", "Find the correctly spelt word:", ["Accommodate", "Acommodate", "Accomodate", "Acommondate"], 0, "easy", "Accommodate has double c and double m."),
      q("Verbal", "Choose the antonym of 'Candid':", ["Frank", "Honest", "Evasive", "Open"], 2, "medium", "Candid = truthful and straightforward; opposite = evasive."),
      q("Verbal", "Fill in the blank: He is _______ better of the two players.", ["a", "the", "an", "no article"], 1, "medium", "Superlative form with 'of the two' → 'the'."),
      q("Verbal", "Identify the part with an error: 'One of my friend / is going / to Delhi / tomorrow.'", ["One of my friend", "is going", "to Delhi", "tomorrow"], 0, "easy", "'One of' requires plural noun: 'One of my friends'."),
      q("Verbal", "Choose the best replacement: 'The weather was so cold that we could not go out.' Begin with 'So cold was the weather' —", ["that we could not go out.", "so we could not go out.", "that we cannot go out.", "then we could not go out."], 0, "medium", "Inversion pattern 'So cold was … that …'."),
      q("Verbal", "Antonym of 'Ostentatious':", ["Showy", "Modest", "Loud", "Bright"], 1, "hard", "Ostentatious = designed to impress; opposite = modest."),
      q("Verbal", "Select the grammatically correct sentence:", ["Neither of the answers are correct.", "Neither of the answers is correct.", "Neither of the answer is correct.", "Neither of the answers were correct."], 1, "medium", "'Neither of' takes a singular verb."),
      q("Verbal", "A 'Catch-22' situation means:", ["A dilemma with no escape", "A lucky break", "A fair deal", "A simple choice"], 0, "hard", "Catch-22 = a no-win paradox."),
      q("Verbal", "Fill in the blank: The manager asked his team to _______ the plan before the meeting.", ["reciprocate", "reiterate", "rejuvenate", "recapitulate"], 1, "hard", "Reiterate = repeat/reaffirm; recapitulate = summarise (also plausible, but reiterate fits 'restate the plan')."),
      q("Programming Logic", "What is the output of the pseudocode? a = 5; b = 2; print(a % b);", ["1", "2", "2.5", "Error"], 0, "easy", "5 mod 2 = 1."),
      q("Programming Logic", "Which data structure works on FIFO?", ["Stack", "Queue", "Tree", "Graph"], 1, "easy", "Queue = First In First Out."),
      q("Programming Logic", "What is the time complexity of binary search on a sorted array of n elements?", ["O(1)", "O(log n)", "O(n)", "O(n log n)"], 1, "medium", "Binary search halves the search space each step."),
      q("Programming Logic", "What does the following loop print? for i = 1 to 4 step 1: print i*i", ["1 4 9 16", "1 4 9 16 25", "1 2 3 4", "2 4 6 8"], 0, "easy", "Squares of 1..4."),
      q("Programming Logic", "What is the output? x = 10; if x > 5: x = x + 5; else: x = x - 5; print x", ["10", "15", "5", "20"], 1, "easy", "10 > 5 → x = 15."),
      q("Programming Logic", "Which of the following is NOT a primitive data type?", ["Integer", "Boolean", "Array", "Character"], 2, "medium", "Array is a composite data type."),
      q("Programming Logic", "What is the output? s = 'TCSNQT'; print s[0] + s[5]", ["TQ", "TT", "QT", "Error"], 0, "medium", "Index 0 = 'T', index 5 = 'Q'."),
      q("Programming Logic", "How many times does 'Hello' print? for i = 1 to 3: for j = 1 to 2: print 'Hello'", ["3", "5", "6", "9"], 2, "easy", "3 × 2 = 6 iterations."),
      q("Programming Logic", "What is the worst-case time complexity of a bubble sort?", ["O(n)", "O(n log n)", "O(n²)", "O(log n)"], 2, "medium", "Bubble sort worst case is O(n²)."),
      q("Programming Logic", "What is the output? n = 5; f = 1; while n > 1: f = f * n; n = n - 1; print f", ["24", "60", "120", "125"], 2, "medium", "Computes 5! = 120."),
    ],
    notes: [
      "Seed set is a blend of classic aptitude items and TCS-style pseudocode questions; the AI agents extend it when search/LLM backends are available.",
    ],
  },

  // =========================================================================
  // Wipro NLTH
  // =========================================================================
  {
    aliases: ["wipro", "wipro nlth", "wipro national level talent hunt"],
    pattern: {
      examName: "Wipro NLTH",
      durationMinutes: 90,
      totalQuestions: 50,
      negativeMarking: 0.25,
      markingScheme: { perQuestion: 1, negativePerWrong: 0.25 },
      sections: [
        { name: "Quantitative Aptitude", topics: ["Arithmetic", "Algebra", "Percentages"], questionCount: 20, marksPerQuestion: 1 },
        { name: "Logical Reasoning", topics: ["Series", "Coding-Decoding", "Puzzles"], questionCount: 15, marksPerQuestion: 1 },
        { name: "Verbal Ability", topics: ["Grammar", "Vocabulary"], questionCount: 15, marksPerQuestion: 1 },
      ],
      notes: ["Sectional cut-offs apply; negative marking of 0.25 per wrong answer."],
    },
    questions: [
      q("Arithmetic", "The price of an article is reduced by 20%. By what percentage must it be increased to restore the original price?", ["20%", "25%", "24%", "22.5%"], 1, "medium", "1/0.8 = 1.25 → 25%."),
      q("Arithmetic", "A man walks 6 km in 1 hour 30 minutes. His speed in m/s is:", ["1.11", "1.67", "2.22", "3.33"], 0, "easy", "6000 m / 5400 s = 1.11 m/s."),
      q("Algebra", "If 3x − 4 = 2x + 6, then x = ?", ["6", "8", "10", "12"], 2, "easy", "x = 10."),
      q("Series", "Find the next number: 2, 6, 12, 20, 30, ?", ["36", "40", "42", "44"], 2, "easy", "Differences +4,+6,+8,+10 → +12 → 42."),
      q("Coding-Decoding", "If TABLE is coded as ABLET (first letter moved to the end), then CHAIR is coded as:", ["HAIRC", "HCAIR", "AHRCI", "CRAIH"], 0, "easy", "Move the first letter to the end: CHAIR → HAIRC."),
      q("Verbal", "Choose the synonym of 'Abundant':", ["Scarce", "Plentiful", "Limited", "Rare"], 1, "easy", "Abundant = plentiful."),
      q("Verbal", "Fill in: Each of the boys _______ given a prize.", ["was", "were", "have", "are"], 0, "easy", "Each takes a singular verb."),
      q("Logical Reasoning", "In a code where A=1, B=2, … Z=26, the value of the word 'EASY' is:", ["48", "50", "52", "54"], 1, "easy", "E=5, A=1, S=19, Y=25 → 50."),
      q("Arithmetic", "A shopkeeper buys 100 oranges at ₹2 each and sells 80 at ₹3 each. The rest rot. Profit/loss is:", ["₹20 profit", "₹40 profit", "₹20 loss", "No profit no loss"], 1, "medium", "Cost 200, revenue 240 → 40 profit."),
    ],
    notes: ["Small seed set — pipeline augments from search when available."],
  },

  // =========================================================================
  // Infosys SP / InfyTQ
  // =========================================================================
  {
    aliases: ["infosys", "infosys sp", "infytq", "infosys system programmer"],
    pattern: {
      examName: "Infosys SP & InfyTQ",
      durationMinutes: 100,
      totalQuestions: 60,
      negativeMarking: 0,
      markingScheme: { perQuestion: 1, negativePerWrong: 0 },
      sections: [
        { name: "Mathematical Ability", topics: ["Arithmetic", "Permutations", "Probability"], questionCount: 20, marksPerQuestion: 1 },
        { name: "Logical Reasoning", topics: ["Series", "Syllogisms", "Blood Relations"], questionCount: 20, marksPerQuestion: 1 },
        { name: "Verbal Ability", topics: ["Grammar", "Comprehension"], questionCount: 20, marksPerQuestion: 1 },
      ],
      notes: ["InfyTQ adds a programming track; the MCQ paper is aptitude-heavy."],
    },
    questions: [
      q("Probability", "Two dice are rolled. The probability of getting a sum of 7 is:", ["1/6", "1/9", "5/36", "1/12"], 0, "easy", "6 favourable / 36 = 1/6."),
      q("Permutations", "In how many ways can 5 books be arranged on a shelf?", ["60", "120", "240", "720"], 1, "easy", "5! = 120."),
      q("Arithmetic", "If 5 men or 7 women earn ₹875 in a day, what will 10 men and 5 women earn in a day?", ["₹2,250", "₹2,375", "₹2,500", "₹2,625"], 1, "hard", "Man/day = 175, woman/day = 125. 10×175 + 5×125 = 1750+625 = 2375."),
      q("Syllogisms", "All flowers are trees. Some trees are fruits. Conclusion: Some flowers are fruits.", ["Follows", "Does not follow", "Depends", "None"], 1, "medium", "The fruit-trees may be the non-flower trees."),
      q("Blood Relations", "A is B's sister. C is B's mother. D is C's father. How is D related to A?", ["Grandfather", "Father", "Uncle", "Brother"], 0, "easy", "D is the father of B's mother → grandfather of A."),
      q("Verbal", "Choose the word with the correct spelling:", ["Separate", "Seperate", "Saperate", "Separete"], 0, "easy", "Separate."),
      q("Arithmetic", "A number is increased by 25% and then decreased by 25%. Net change is:", ["No change", "6.25% decrease", "6.25% increase", "12.5% decrease"], 1, "medium", "1.25 × 0.75 = 0.9375 → 6.25% decrease."),
      q("Series", "Find the missing term: 5, 11, 23, 47, ?", ["93", "95", "97", "99"], 1, "medium", "×2+1 each → 95."),
      q("Verbal", "Antonym of 'Transparent':", ["Clear", "Opaque", "Open", "Plain"], 1, "easy", "Opaque."),
      q("Logical Reasoning", "In a code where A=1, B=2, … Z=26: MATH = 42 and BOOK = 43. What is the code for CAMP?", ["32", "33", "34", "35"], 1, "hard", "M13+A1+T20+H8 = 42; B2+O15+O15+K11 = 43; C3+A1+M13+P16 = 33."),
    ],
    notes: ["Classic SP selection-set flavour; percentages and syllogisms are frequent."],
  },

  // =========================================================================
  // Accenture
  // =========================================================================
  {
    aliases: ["accenture", "accenture cognitive", "accenture placement"],
    pattern: {
      examName: "Accenture Cognitive Assessment",
      durationMinutes: 90,
      totalQuestions: 50,
      negativeMarking: 0,
      markingScheme: { perQuestion: 1, negativePerWrong: 0 },
      sections: [
        { name: "Aptitude", topics: ["Arithmetic", "Percentages", "Time & Work"], questionCount: 20, marksPerQuestion: 1 },
        { name: "Reasoning", topics: ["Series", "Analogy", "Coding-Decoding"], questionCount: 15, marksPerQuestion: 1 },
        { name: "English", topics: ["Grammar", "Vocabulary", "Comprehension"], questionCount: 15, marksPerQuestion: 1 },
      ],
      notes: ["Cognitive round is followed by a coding round in the real process."],
    },
    questions: [
      q("Time & Work", "A can do a job in 12 days, B in 18 days. Together they finish in:", ["6 days", "7.2 days", "8 days", "9 days"], 1, "easy", "1/12 + 1/18 = 5/36 → 7.2 days."),
      q("Percentages", "40% of 40% of 500 is:", ["60", "80", "100", "120"], 1, "easy", "0.4 × 0.4 × 500 = 80."),
      q("Analogy", "Book : Page :: Ladder : ?", ["Rung", "Step", "Wood", "Climb"], 0, "medium", "A page is a part of a book; a rung is a part of a ladder."),
      q("Coding-Decoding", "If SUN is coded as TVO (each letter +1), then MOON is coded as:", ["NPPO", "NQRR", "NQQP", "NPQQ"], 0, "medium", "Each letter shifted +1: M→N, O→P, O→P, N→O → NPPO."),
      q("Verbal", "Fill in: The data collected _______ reliable.", ["is", "are", "were", "have been"], 0, "hard", "'Data' treated as a singular mass noun in modern usage."),
      q("Arithmetic", "A vendor gains 10% by selling an article for ₹880. His cost price is:", ["₹760", "₹780", "₹800", "₹820"], 2, "medium", "CP = 880/1.1 = 800."),
      q("Series", "Find the odd term: 4, 9, 16, 25, 36, 49, 64, 81", ["9", "25", "49", "All are perfect squares"], 3, "easy", "All are perfect squares."),
      q("Logical Reasoning", "If the day before yesterday was Wednesday, what day will it be the day after tomorrow?", ["Saturday", "Sunday", "Monday", "Tuesday"], 1, "medium", "Today = Friday → day after tomorrow = Sunday."),
      q("Verbal", "Choose the synonym of 'Pragmatic':", ["Idealistic", "Practical", "Theoretical", "Optimistic"], 1, "medium", "Pragmatic = practical."),
      q("Arithmetic", "The difference between 20% of a number and 15% of the same number is 25. The number is:", ["400", "500", "600", "700"], 1, "easy", "5% = 25 → 100% = 500."),
    ],
    notes: ["Cognitive-round style; per-section time limits in the real exam."],
  },

  // =========================================================================
  // Cognizant CTS
  // =========================================================================
  {
    aliases: ["cognizant", "cts", "cognizant cts"],
    pattern: {
      examName: "Cognizant CTS",
      durationMinutes: 90,
      totalQuestions: 60,
      negativeMarking: 0,
      markingScheme: { perQuestion: 1, negativePerWrong: 0 },
      sections: [
        { name: "Quantitative Aptitude", topics: ["Arithmetic", "Algebra", "Geometry"], questionCount: 25, marksPerQuestion: 1 },
        { name: "Logical Reasoning", topics: ["Puzzles", "Syllogisms", "Data Sufficiency"], questionCount: 20, marksPerQuestion: 1 },
        { name: "English", topics: ["Grammar", "Reading", "Vocabulary"], questionCount: 15, marksPerQuestion: 1 },
      ],
      notes: ["CTS is known for high-difficulty puzzles and data sufficiency items."],
    },
    questions: [
      q("Puzzles", "What number replaces the question mark? 1, 4, 9, 16, 25, ?", ["30", "34", "36", "49"], 2, "easy", "Perfect squares → 36."),
      q("Data Sufficiency", "To find the age of a boy: (I) He is 3 years older than his sister. (II) His sister is 7. Which statement(s) are sufficient?", ["Only I", "Only II", "Both I and II", "Neither"], 2, "easy", "Both together give 10."),
      q("Arithmetic", "If a:b = 2:3 and b:c = 4:5, then a:b:c = ?", ["2:3:5", "8:12:15", "4:6:5", "2:4:5"], 1, "medium", "a:b = 8:12, b:c = 12:15 → 8:12:15."),
      q("Syllogisms", "Some pens are inks. All inks are colours. Conclusion: Some colours are pens.", ["Follows", "Does not follow", "Depends", "None"], 0, "medium", "Pens subset of inks subset of colours → follows."),
      q("Verbal", "Choose the correctly punctuated sentence:", ["Its a fine day.", "It's a fine day.", "Its' a fine day.", "It is' a fine day."], 1, "easy", "It's = it is."),
      q("Algebra", "If x² − 5x + 6 = 0, the roots are:", ["2 and 3", "−2 and −3", "1 and 6", "−1 and 6"], 0, "easy", "(x−2)(x−3)."),
      q("Geometry", "The perimeter of a square is 48 cm. Its diagonal is:", ["8√2", "12√2", "16√2", "24√2"], 1, "medium", "Side 12 → diagonal 12√2."),
      q("Logical Reasoning", "In a code where A=1, B=2, … Z=26: DOG = 26 and CAT = 24. What is the code for BIRD?", ["27", "28", "33", "38"], 2, "hard", "D4+O15+G7 = 26; C3+A1+T20 = 24; B2+I9+R18+D4 = 33."),
      q("Arithmetic", "A cistern is filled by two taps in 8 and 12 hours. A leak empties it in 24 hours. Time to fill with all open:", ["5 h", "6 h", "7 h", "8 h"], 1, "medium", "1/8+1/12−1/24 = (3+2−1)/24 = 4/24 → 6 h."),
      q("Verbal", "Antonym of 'Benevolent':", ["Kind", "Cruel", "Generous", "Helpful"], 1, "easy", "Cruel."),
    ],
    notes: ["CTS seed set; puzzles section is where difficulty concentrates."],
  },

  // =========================================================================
  // Capgemini
  // =========================================================================
  {
    aliases: ["capgemini", "capgemini excelerator", "capgemini aptitude"],
    pattern: {
      examName: "Capgemini Exceller",
      durationMinutes: 80,
      totalQuestions: 55,
      negativeMarking: 0,
      markingScheme: { perQuestion: 1, negativePerWrong: 0 },
      sections: [
        { name: "Quantitative", topics: ["Arithmetic", "Ratios", "Mensuration"], questionCount: 20, marksPerQuestion: 1 },
        { name: "Logical", topics: ["Series", "Syllogisms", "Direction Sense"], questionCount: 20, marksPerQuestion: 1 },
        { name: "Verbal", topics: ["Grammar", "Vocabulary"], questionCount: 15, marksPerQuestion: 1 },
      ],
      notes: ["Capgemini uses negative marking (0.25) on the aptitude section."],
    },
    questions: [
      q("Ratios", "Divide ₹1,200 between A and B in the ratio 3:5. B's share is:", ["₹450", "₹600", "₹720", "₹750"], 3, "easy", "5/8 × 1200 = 750."),
      q("Direction Sense", "A man walks 5 km north, then 3 km east, then 5 km south. How far is he from the start?", ["3 km east", "5 km", "8 km", "13 km"], 0, "easy", "Net displacement = 3 km east."),
      q("Mensuration", "The volume of a cube is 216 cm³. Its total surface area is:", ["144 cm²", "196 cm²", "216 cm²", "256 cm²"], 2, "medium", "Edge = 6 → TSA = 6×36 = 216."),
      q("Series", "Complete: 1, 1, 2, 6, 24, ?", ["48", "96", "120", "144"], 2, "easy", "Factorials → 120."),
      q("Syllogisms", "All books are pens. All pens are pencils. Conclusion: All books are pencils.", ["Follows", "Does not follow", "Depends", "None"], 0, "easy", "Transitive."),
      q("Verbal", "Fill in: He is senior _______ me.", ["than", "to", "from", "of"], 1, "easy", "Senior to (Latin comparative)."),
      q("Arithmetic", "The cost of 15 pens is ₹180. The cost of 22 pens is:", ["₹250", "₹264", "₹275", "₹280"], 1, "easy", "180/15 × 22 = 264."),
      q("Arithmetic", "A salesman gets 8% commission. His sale is ₹50,000; his commission is:", ["₹3,000", "₹4,000", "₹4,500", "₹5,000"], 1, "easy", "0.08 × 50000 = 4000."),
      q("Logical Reasoning", "In a code where A=1, B=2, … Z=26: FISH = 42. What is the code for BIRD?", ["33", "35", "36", "38"], 0, "hard", "F6+I9+S19+H8 = 42; B2+I9+R18+D4 = 33."),
      q("Verbal", "Choose the synonym of 'Lucid':", ["Vague", "Clear", "Dull", "Confusing"], 1, "easy", "Lucid = clear."),
    ],
    notes: ["Capgemini seed set; commission and ratio items are staples."],
  },
];

/** Case-insensitive fuzzy match of the admin-entered exam name to a corpus profile. */
export function findCorpusExam(examName: string): CorpusExam | null {
  const normalized = examName.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  let best: CorpusExam | null = null;
  let bestScore = 0;
  for (const entry of EXAM_CORPUS) {
    for (const alias of entry.aliases) {
      const a = alias.toLowerCase();
      if (a === normalized) return entry;
      let score = 0;
      const words = a.split(" ");
      for (const w of words) {
        if (w.length > 2 && normalized.includes(w)) score += w.length;
      }
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
  }
  return bestScore >= 3 ? best : null;
}