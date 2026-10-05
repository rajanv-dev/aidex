const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const { execFile } = require('child_process');

/**
 * Normalize string output for reliable comparison
 * Handles CRLF/LF line endings, trims leading/trailing whitespace
 */
function normalizeOutput(str) {
  return String(str ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Case-insensitive & whitespace-tolerant comparison
 */
function isOutputMatch(actual, expected) {
  const normActual = normalizeOutput(actual);
  const normExpected = normalizeOutput(expected);

  if (normActual === normExpected) return true;
  if (normActual.toLowerCase() === normExpected.toLowerCase()) return true;

  // Also check if both can be parsed as numbers and match (e.g. 6 vs 6.0)
  const numActual = Number(normActual);
  const numExpected = Number(normExpected);
  if (!isNaN(numActual) && !isNaN(numExpected) && normActual !== '' && normExpected !== '') {
    if (numActual === numExpected) return true;
  }

  return false;
}

/**
 * Optional Remote Render Execution Runner
 * Directly executes code on the dedicated Render Linux/Docker OpenJDK 17 container
 */
async function runRenderRemoteCompiler(code, language = 'java', input = '') {
  const renderUrl = (process.env.RENDER_BACKEND_URL || 'https://aidex-2.onrender.com').replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const postData = JSON.stringify({ code, selectedLanguage: language, input });

    const res = await fetch(`${renderUrl}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const execCtrl = new AbortController();
      const execTimeout = setTimeout(() => execCtrl.abort(), 10000);
      const execRes = await fetch(`${renderUrl}/api/rounds/round3/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: postData,
        signal: execCtrl.signal,
      });
      clearTimeout(execTimeout);
      const data = await execRes.json();
      if (data && (data.output !== undefined || data.error !== undefined)) {
        return {
          success: !!data.success,
          output: data.output || '',
          error: data.error || null,
        };
      }
    }
  } catch (_) {
    // Failover automatically to Paiza cloud compiler
  }
  return null;
}

/**
 * Fallback Cloud Execution Engine (Paiza API) for Environments
 * where local compilers (javac, python, g++) are not available or fail.
 */
function runPaizaCloudCompiler(code, language = 'java', input = '') {
  return new Promise((resolve) => {
    let lang = (language || 'java').toLowerCase().trim();
    if (lang === 'py' || lang === 'python') lang = 'python';
    if (lang === 'cpp' || lang === 'c++') lang = 'cpp';
    if (lang === 'js' || lang === 'javascript') lang = 'javascript';

    const postData = JSON.stringify({
      source_code: code,
      language: lang,
      input: input || '',
      longpoll: true,
      api_key: 'guest',
    });

    const req = https.request('https://api.paiza.io/runners/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.id) {
            pollPaizaDetails(parsed.id, resolve, Date.now());
          } else {
            resolve({ success: false, output: '', error: parsed.error || 'Cloud compilation service error' });
          }
        } catch (e) {
          resolve({ success: false, output: '', error: e.message });
        }
      });
    });

    req.on('error', (err) => resolve({ success: false, output: '', error: `Cloud connection failed: ${err.message}` }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, output: '', error: 'Cloud execution request timed out' });
    });
    req.write(postData);
    req.end();
  });
}

function pollPaizaDetails(id, resolve, startTime) {
  https.get(`https://api.paiza.io/runners/get_details?id=${id}&api_key=guest`, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      try {
        const details = JSON.parse(body);
        if (details.status === 'running') {
          if (Date.now() - startTime > 12000) {
            return resolve({ success: false, output: '', error: 'Execution timed out (12s limit)' });
          }
          return setTimeout(() => pollPaizaDetails(id, resolve, startTime), 350);
        }

        const stdout = details.stdout || '';
        const stderr = details.stderr || details.build_stderr || '';
        const success = details.result === 'success';
        resolve({
          success,
          output: stdout,
          error: success ? null : (stderr || details.result || 'Execution failed with non-zero exit code'),
        });
      } catch (e) {
        resolve({ success: false, output: '', error: e.message });
      }
    });
  }).on('error', (err) => resolve({ success: false, output: '', error: `Polling error: ${err.message}` }));
}

/**
 * Execute code snippet in isolated child process with timeout protection
 * @param {string} code - source code to execute
 * @param {string} language - programming language ('javascript', 'python', 'cpp', 'c', 'java', 'typescript')
 * @param {object} options - execution options
 * @returns {Promise<{ success: boolean, output: string, error: string|null, executionTimeMs: number }>}
 */
async function executeCode(code, language = 'javascript', options = {}) {
  const timeoutMs = options.timeoutMs || 4000;
  const lang = (language || 'javascript').toLowerCase().trim();

  // Create isolated temp directory
  const runId = crypto.randomUUID();
  const tempDir = path.join(os.tmpdir(), `cb_run_${runId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const startTime = Date.now();

  try {
    let result;
    const input = options.input || '';
    if (lang === 'python' || lang === 'py') {
      result = await runPython(code, tempDir, timeoutMs, input);
    } else if (lang === 'javascript' || lang === 'js') {
      result = await runJavaScript(code, tempDir, timeoutMs, input);
    } else if (lang === 'typescript' || lang === 'ts') {
      result = await runTypeScript(code, tempDir, timeoutMs, input);
    } else if (lang === 'cpp' || lang === 'c++') {
      result = await runCpp(code, tempDir, timeoutMs, input);
    } else if (lang === 'c') {
      result = await runC(code, tempDir, timeoutMs, input);
    } else if (lang === 'java') {
      result = await runJava(code, tempDir, timeoutMs, input);
    } else {
      // Default to JavaScript
      result = await runJavaScript(code, tempDir, timeoutMs, input);
    }

    const executionTimeMs = Date.now() - startTime;
    return {
      ...result,
      executionTimeMs,
    };
  } catch (err) {
    const executionTimeMs = Date.now() - startTime;
    return {
      success: false,
      output: '',
      error: err.message || 'Execution failed',
      executionTimeMs,
    };
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

function runCommandAsync(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, {
      cwd: options.cwd,
      timeout: options.timeout,
      maxBuffer: 1024 * 1024, // 1MB buffer
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed || error.signal === 'SIGTERM') {
          resolve({
            success: false,
            output: stdout ? stdout.toString() : '',
            error: 'Execution timed out (Time limit exceeded: 4s limit). Check for infinite loops.',
          });
        } else {
          resolve({
            success: false,
            output: stdout ? stdout.toString() : '',
            error: stderr ? stderr.toString() : error.message,
          });
        }
      } else {
        resolve({
          success: true,
          output: stdout ? stdout.toString() : '',
          error: stderr ? stderr.toString() : null,
        });
      }
    });

    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

const isMissingCmd = (err) => {
  if (!err) return false;
  const str = String(err).toLowerCase();
  return str.includes('enoent') ||
         str.includes('not found') ||
         str.includes('not recognized') ||
         str.includes('unable to create process') ||
         str.includes('the system cannot find');
};

async function runPython(code, tempDir, timeoutMs, input) {
  const filePath = path.join(tempDir, 'solution.py');
  fs.writeFileSync(filePath, code, 'utf8');

  // 1. Try 'python'
  let res = await runCommandAsync('python', [filePath], {
    cwd: tempDir,
    timeout: timeoutMs,
    input,
  });

  // 2. If python failed due to missing binary, try 'python3'
  if (!res.success && isMissingCmd(res.error)) {
    res = await runCommandAsync('python3', [filePath], {
      cwd: tempDir,
      timeout: timeoutMs,
      input,
    });
  }

  // 3. If python3 failed due to missing binary, try 'py'
  if (!res.success && isMissingCmd(res.error)) {
    res = await runCommandAsync('py', [filePath], {
      cwd: tempDir,
      timeout: timeoutMs,
      input,
    });
  }

  // 4. Fallback to Cloud Execution API if local Python is not found
  if (!res.success && isMissingCmd(res.error)) {
    res = await runPaizaCloudCompiler(code, 'python', input);
  }

  return res;
}

async function runJavaScript(code, tempDir, timeoutMs, input) {
  const filePath = path.join(tempDir, 'solution.js');
  fs.writeFileSync(filePath, code, 'utf8');

  return await runCommandAsync(process.execPath, [filePath], {
    cwd: tempDir,
    timeout: timeoutMs,
    input,
  });
}

async function runTypeScript(code, tempDir, timeoutMs, input) {
  const filePath = path.join(tempDir, 'solution.ts');
  fs.writeFileSync(filePath, code, 'utf8');

  let res = await runCommandAsync('npx', ['ts-node', filePath], {
    cwd: tempDir,
    timeout: timeoutMs,
    shell: true,
    input,
  });

  if (!res.success && isMissingCmd(res.error)) {
    res = await runJavaScript(code, tempDir, timeoutMs, input);
  }

  return res;
}

async function runCpp(code, tempDir, timeoutMs, input) {
  const srcPath = path.join(tempDir, 'solution.cpp');
  const binPath = path.join(tempDir, process.platform === 'win32' ? 'solution.exe' : 'solution');
  fs.writeFileSync(srcPath, code, 'utf8');

  const compileRes = await runCommandAsync('g++', [srcPath, '-o', binPath], {
    cwd: tempDir,
    timeout: timeoutMs,
  });

  if (!compileRes.success) {
    if (isMissingCmd(compileRes.error)) {
      return await runPaizaCloudCompiler(code, 'cpp', input);
    }
    return {
      success: false,
      output: '',
      error: `Compilation Error:\n${compileRes.error || compileRes.output}`,
    };
  }

  return await runCommandAsync(binPath, [], {
    cwd: tempDir,
    timeout: timeoutMs,
    input,
  });
}

async function runC(code, tempDir, timeoutMs, input) {
  const srcPath = path.join(tempDir, 'solution.c');
  const binPath = path.join(tempDir, process.platform === 'win32' ? 'solution.exe' : 'solution');
  fs.writeFileSync(srcPath, code, 'utf8');

  const compileRes = await runCommandAsync('gcc', [srcPath, '-o', binPath], {
    cwd: tempDir,
    timeout: timeoutMs,
  });

  if (!compileRes.success) {
    if (isMissingCmd(compileRes.error)) {
      return await runPaizaCloudCompiler(code, 'c', input);
    }
    return {
      success: false,
      output: '',
      error: `Compilation Error:\n${compileRes.error || compileRes.output}`,
    };
  }

  return await runCommandAsync(binPath, [], {
    cwd: tempDir,
    timeout: timeoutMs,
    input,
  });
}

function findJdkBinary(binaryName) {
  const isWin = process.platform === 'win32';
  const binFile = isWin ? `${binaryName}.exe` : binaryName;

  if (process.env.JAVA_HOME) {
    const javaHomeBin = path.join(process.env.JAVA_HOME, 'bin', binFile);
    if (fs.existsSync(javaHomeBin)) return javaHomeBin;
  }

  const searchDirs = [
    'C:\\Java',
    'C:\\Program Files\\Java',
    'C:\\Program Files (x86)\\Java',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Eclipse Adoptium'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
    '/usr/lib/jvm',
    '/usr/local',
  ];

  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && (
            entry.name.toLowerCase().includes('jdk') ||
            entry.name.toLowerCase().includes('java') ||
            entry.name.toLowerCase().includes('temurin') ||
            entry.name.toLowerCase().includes('adoptium') ||
            entry.name.toLowerCase().includes('zulu') ||
            entry.name.toLowerCase().includes('corretto')
          )) {
            const candidate = path.join(dir, entry.name, 'bin', binFile);
            if (fs.existsSync(candidate)) {
              return candidate;
            }
          }
        }
      } catch {
        // ignore read errors
      }
    }
  }

  return binaryName;
}

function findJavacPath() {
  return findJdkBinary('javac');
}

function findJavaPath() {
  return findJdkBinary('java');
}

function extractJavaClassName(code) {
  // Strip comments
  const cleanCode = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  
  // 1. Check for public class
  const pubMatch = cleanCode.match(/public\s+class\s+([A-Za-z0-9_]+)/);
  if (pubMatch) return pubMatch[1];

  // 2. Find class containing main method
  const classRegex = /class\s+([A-Za-z0-9_]+)\s*\{([^}]*public\s+static\s+void\s+main[\s\S]*?)\}/g;
  let match;
  while ((match = classRegex.exec(cleanCode)) !== null) {
    return match[1];
  }

  // 3. Fallback to any class near main
  const beforeMain = cleanCode.split(/public\s+static\s+void\s+main/)[0];
  const allBeforeClasses = [...beforeMain.matchAll(/class\s+([A-Za-z0-9_]+)/g)];
  if (allBeforeClasses.length > 0) {
    return allBeforeClasses[allBeforeClasses.length - 1][1];
  }

  // 4. Match first class definition
  const firstClass = cleanCode.match(/class\s+([A-Za-z0-9_]+)/);
  if (firstClass) return firstClass[1];

  return 'Main';
}

async function runJava(code, tempDir, timeoutMs, input) {
  // Strip package declaration so code runs in flat temp execution directory
  const cleanCode = code.replace(/^\s*package\s+[^;]+;/gm, '');
  const className = extractJavaClassName(cleanCode);
  const srcPath = path.join(tempDir, `${className}.java`);
  fs.writeFileSync(srcPath, cleanCode, 'utf8');

  const javacCmd = findJavacPath();
  const javaCmd = findJavaPath();

  let compileRes = await runCommandAsync(javacCmd, [srcPath], {
    cwd: tempDir,
    timeout: Math.max(timeoutMs, 6000),
  });

  if (compileRes.success) {
    return await runCommandAsync(javaCmd, ['-cp', '.', className], {
      cwd: tempDir,
      timeout: Math.max(timeoutMs, 6000),
      input,
    });
  }

  // If javac fails due to missing javac binary, try Java 11+ single-file execution or Paiza
  if (isMissingCmd(compileRes.error)) {
    const directRes = await runCommandAsync(javaCmd, [srcPath], {
      cwd: tempDir,
      timeout: Math.max(timeoutMs, 6000),
      input,
    });

    if (isMissingCmd(directRes.error)) {
      const renderRes = await runRenderRemoteCompiler(cleanCode, 'java', input);
      if (renderRes) return renderRes;
      return await runPaizaCloudCompiler(cleanCode, 'java', input);
    }

    if (!directRes.success && (directRes.error?.includes('error:') || directRes.output?.includes('error:'))) {
      return {
        success: false,
        output: directRes.output || '',
        error: `Compilation Error:\n${directRes.error || directRes.output}`,
      };
    }

    return directRes;
  }

  return {
    success: false,
    output: '',
    error: `Compilation Error:\n${compileRes.error || compileRes.output}`,
  };
}

module.exports = {
  executeCode,
  normalizeOutput,
  isOutputMatch,
};
