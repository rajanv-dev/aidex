require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Question = require('../models/Question');
const RoundControl = require('../models/RoundControl');

const seed = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      if (process.env.MONGODB_URI) {
        try {
          await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
        } catch (err) {
          console.warn('⚠️  Standalone seed could not connect to remote MONGODB_URI. Seed will run on server startup automatically.');
          return;
        }
      }
    }

    // ─── Admin Account ────────────────────────────────────────────────────────
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (!existingAdmin) {
      await User.create({
        name: 'Event Admin',
        username: 'admin',
        password: 'CodeBreaker123',
        role: 'admin',
      });
      console.log('👑  Admin created: username=admin, password=CodeBreaker123');
    }

    // ─── RoundControl docs (all 3 rounds, locked by default) ─────────────────
    for (const round of [1, 2, 3]) {
      await RoundControl.findOneAndUpdate(
        { round },
        { round, isUnlocked: false },
        { upsert: true }
      );
    }

    // ─── Sample Round 1 Questions (Basic: 15 questions x 2 marks = 30 marks) ──
    const r1Count = await Question.countDocuments({ round: 1 });
    if (r1Count === 0) {
      await Question.insertMany([
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'What does CPU stand for?',
          options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit'],
          correctOptionIndex: 0,
          correctAnswer: 'Central Processing Unit',
          marks: 2,
          points: 2,
          order: 1,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'Which data structure uses LIFO ordering?',
          options: ['Queue', 'Stack', 'Array', 'Tree'],
          correctOptionIndex: 1,
          correctAnswer: 'Stack',
          marks: 2,
          points: 2,
          order: 2,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'What is the time complexity of binary search?',
          options: ['O(n)', 'O(n²)', 'O(log n)', 'O(1)'],
          correctOptionIndex: 2,
          correctAnswer: 'O(log n)',
          marks: 2,
          points: 2,
          order: 3,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'Which keyword is used to define a function in Python?',
          options: ['function', 'fun', 'def', 'define'],
          correctOptionIndex: 2,
          correctAnswer: 'def',
          marks: 2,
          points: 2,
          order: 4,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'What is the output of typeof null in JavaScript?',
          options: ['null', 'undefined', 'object', 'string'],
          correctOptionIndex: 2,
          correctAnswer: 'object',
          marks: 2,
          points: 2,
          order: 5,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'Which sorting algorithm has O(n log n) average time complexity?',
          options: ['Bubble Sort', 'Selection Sort', 'Quick Sort', 'Insertion Sort'],
          correctOptionIndex: 2,
          correctAnswer: 'Quick Sort',
          marks: 2,
          points: 2,
          order: 6,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'In HTML, which tag is used for the largest heading?',
          options: ['<h6>', '<heading>', '<h1>', '<head>'],
          correctOptionIndex: 2,
          correctAnswer: '<h1>',
          marks: 2,
          points: 2,
          order: 7,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'What does SQL stand for?',
          options: ['Structured Query Language', 'Simple Query Logic', 'System Query Language', 'Structured Quick Language'],
          correctOptionIndex: 0,
          correctAnswer: 'Structured Query Language',
          marks: 2,
          points: 2,
          order: 8,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'Which protocol is used to send emails?',
          options: ['FTP', 'HTTP', 'SMTP', 'POP3'],
          correctOptionIndex: 2,
          correctAnswer: 'SMTP',
          marks: 2,
          points: 2,
          order: 9,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'What is a primary key in a database?',
          options: ['A key that can be duplicated', 'A key that uniquely identifies a row', 'A foreign reference key', 'A key used for encryption'],
          correctOptionIndex: 1,
          correctAnswer: 'A key that uniquely identifies a row',
          marks: 2,
          points: 2,
          order: 10,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'In Git, which command stages all changes?',
          options: ['git commit -a', 'git push', 'git add .', 'git stage --all'],
          correctOptionIndex: 2,
          correctAnswer: 'git add .',
          marks: 2,
          points: 2,
          order: 11,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'What does RAM stand for?',
          options: ['Read Access Memory', 'Random Access Memory', 'Rapid Application Memory', 'Runtime Access Module'],
          correctOptionIndex: 1,
          correctAnswer: 'Random Access Memory',
          marks: 2,
          points: 2,
          order: 12,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'Which of the following is not an OOP principle?',
          options: ['Encapsulation', 'Polymorphism', 'Compilation', 'Inheritance'],
          correctOptionIndex: 2,
          correctAnswer: 'Compilation',
          marks: 2,
          points: 2,
          order: 13,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'What is the base of hexadecimal number system?',
          options: ['2', '8', '10', '16'],
          correctOptionIndex: 3,
          correctAnswer: '16',
          marks: 2,
          points: 2,
          order: 14,
        },
        {
          round: 1,
          questionType: 'mcq',
          questionText: 'Which CSS property changes the text color?',
          options: ['font-color', 'text-color', 'color', 'foreground'],
          correctOptionIndex: 2,
          correctAnswer: 'color',
          marks: 2,
          points: 2,
          order: 15,
        },
      ]);
      console.log('📝  Round 1: 15 sample Basic questions created (2 marks each)');
    }

    // ─── Sample Round 2 Questions (Intermediate: 10 questions x 3 marks = 30 marks) ──
    const r2Count = await Question.countDocuments({ round: 2 });
    if (r2Count === 0) {
      await Question.insertMany([
        {
          round: 2,
          questionType: 'output',
          title: 'JavaScript Exponentiation',
          questionText: 'What is the output of factorial(5)?',
          codeSnippet: `let x = 5;\nlet y = 2;\nconsole.log(x ** y);`,
          language: 'javascript',
          correctOutput: '25',
          correctAnswer: '25',
          marks: 3,
          points: 3,
          order: 1,
        },
        {
          round: 2,
          questionType: 'output',
          title: 'Python String Slicing',
          questionText: 'Predict the output of string slicing:',
          codeSnippet: `s = "CodeBreakers"\nprint(s[4:8])`,
          language: 'python',
          correctOutput: 'Brea',
          correctAnswer: 'Brea',
          marks: 3,
          points: 3,
          order: 2,
        },
        {
          round: 2,
          questionType: 'output',
          title: 'JavaScript Array Slicing',
          questionText: 'What does arr.slice(1, 3) return?',
          codeSnippet: `const arr = [1, 2, 3, 4, 5];\nconsole.log(arr.slice(1, 3));`,
          language: 'javascript',
          correctOutput: '[2, 3]',
          correctAnswer: '[2, 3]',
          marks: 3,
          points: 3,
          order: 3,
        },
        {
          round: 2,
          questionType: 'output',
          title: 'Python List Length',
          questionText: 'What is len(lst) after append?',
          codeSnippet: `lst = [10, 20, 30]\nlst.append(40)\nprint(len(lst))`,
          language: 'python',
          correctOutput: '4',
          correctAnswer: '4',
          marks: 3,
          points: 3,
          order: 4,
        },
        {
          round: 2,
          questionType: 'output',
          title: 'JavaScript Type Comparison',
          questionText: 'What is typeof undefined === typeof null?',
          codeSnippet: `console.log(typeof undefined === typeof null);`,
          language: 'javascript',
          correctOutput: 'false',
          correctAnswer: 'false',
          marks: 3,
          points: 3,
          order: 5,
        },
        {
          round: 2,
          questionType: 'output',
          title: 'JavaScript Scope & Hoisting',
          questionText: 'Predict output of var vs let:',
          codeSnippet: `console.log(a);\nvar a = 10;`,
          language: 'javascript',
          correctOutput: 'undefined',
          correctAnswer: 'undefined',
          marks: 3,
          points: 3,
          order: 6,
        },
        {
          round: 2,
          questionType: 'output',
          title: 'Python List Comprehension',
          questionText: 'What is printed by list comprehension?',
          codeSnippet: `res = [x*2 for x in [1, 2, 3]]\nprint(res)`,
          language: 'python',
          correctOutput: '[2, 4, 6]',
          correctAnswer: '[2, 4, 6]',
          marks: 3,
          points: 3,
          order: 7,
        },
        {
          round: 2,
          questionType: 'output',
          title: 'JavaScript Array Map',
          questionText: 'What is printed by map?',
          codeSnippet: `console.log([1, 2, 3].map(x => x + 1));`,
          language: 'javascript',
          correctOutput: '[2, 3, 4]',
          correctAnswer: '[2, 3, 4]',
          marks: 3,
          points: 3,
          order: 8,
        },
        {
          round: 2,
          questionType: 'output',
          title: 'Python Dictionary Access',
          questionText: 'What is d.get("a", 0)?',
          codeSnippet: `d = {"a": 100}\nprint(d.get("b", 50))`,
          language: 'python',
          correctOutput: '50',
          correctAnswer: '50',
          marks: 3,
          points: 3,
          order: 9,
        },
        {
          round: 2,
          questionType: 'output',
          title: 'JavaScript Closure Sum',
          questionText: 'What does add(5)(10) evaluate to?',
          codeSnippet: `const add = a => b => a + b;\nconsole.log(add(5)(10));`,
          language: 'javascript',
          correctOutput: '15',
          correctAnswer: '15',
          marks: 3,
          points: 3,
          order: 10,
        },
      ]);
      console.log('💻  Round 2: 10 sample Intermediate questions created (3 marks each)');
    }

    // ─── Sample Round 3 Questions (Advanced: 5 questions x 8 marks = 40 marks) ─────
    const r3Count = await Question.countDocuments({ round: 3 });
    if (r3Count === 0) {
      await Question.insertMany([
        {
          round: 3,
          questionType: 'debug',
          title: 'Fix the Loop Range',
          questionText: 'Fix off-by-one index error in list summation:',
          buggyCode: `def sum_list(nums):\n    total = 0\n    for i in range(len(nums) + 1):  # bug here\n        total += nums[i]\n    return total\n\nprint(sum_list([1, 2, 3]))`,
          language: 'python',
          expectedOutput: '6',
          correctOutput: '6',
          correctAnswer: '6',
          marks: 8,
          points: 8,
          order: 1,
        },
        {
          round: 3,
          questionType: 'debug',
          title: 'Fix the Factorial Base Case',
          questionText: 'Fix base case in recursive factorial:',
          buggyCode: `function factorial(n) {\n  if (n === 0) return 0; // bug here\n  return n * factorial(n - 1);\n}\nconsole.log(factorial(5));`,
          language: 'javascript',
          expectedOutput: '120',
          correctOutput: '120',
          correctAnswer: '120',
          marks: 8,
          points: 8,
          order: 2,
        },
        {
          round: 3,
          questionType: 'debug',
          title: 'Fix the Palindrome Check Slicing',
          questionText: 'Fix string reversal step in palindrome check:',
          buggyCode: `def is_palindrome(s):\n    return s == s[::-2]  # bug here\n\nprint(is_palindrome("racecar"))`,
          language: 'python',
          expectedOutput: 'True',
          correctOutput: 'True',
          correctAnswer: 'True',
          marks: 8,
          points: 8,
          order: 3,
        },
        {
          round: 3,
          questionType: 'debug',
          title: 'Fix Fibonacci Recursion',
          questionText: 'Fix base case condition for fibonacci sequence:',
          buggyCode: `function fib(n) {\n  if (n <= 0) return 1; // bug here\n  if (n === 1) return 1;\n  return fib(n - 1) + fib(n - 2);\n}\nconsole.log(fib(5));`,
          language: 'javascript',
          expectedOutput: '8',
          correctOutput: '8',
          correctAnswer: '8',
          marks: 8,
          points: 8,
          order: 4,
        },
        {
          round: 3,
          questionType: 'debug',
          title: 'Fix Array Maximum Value',
          questionText: 'Fix initialization of max variable:',
          buggyCode: `function findMax(arr) {\n  let max = 0; // bug for negative numbers\n  for (let i = 0; i < arr.length; i++) {\n    if (arr[i] > max) max = arr[i];\n  }\n  return max;\n}\nconsole.log(findMax([-10, -5, -2]));`,
          language: 'javascript',
          expectedOutput: '-2',
          correctOutput: '-2',
          correctAnswer: '-2',
          marks: 8,
          points: 8,
          order: 5,
        },
      ]);
      console.log('🐛  Round 3: 5 sample Advanced questions created (8 marks each)');
    }

    console.log('✅  Seeding complete!');
  } catch (err) {
    console.error('❌  Seed error:', err.message);
  }
};

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = seed;
