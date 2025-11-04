import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Vitest Test to check for ENDPOINTER comments in the backend code?

const routesFolder = path.resolve(__dirname, '..', 'routes');
const routeExt = '.route.ts'
const excludeDirectories = [''];

console.log('Routes folder: ', routesFolder);

describe('Backend API calls must have ENDPOINTER reference', () => {
  it('should have Endpointer comment in the route file', () => {
    const violations: string[] = [];
    
    function scanDirectory(dir: string) {
      const files = fs.readdirSync(dir).filter(file => !excludeDirectories.includes(file));
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          if (!excludeDirectories.includes(file)) {
            scanDirectory(filePath);
          }
        } else if (file.endsWith(routeExt)) {
          checkFile(filePath);
        }
      }
    }
    
    function checkFile(filePath: string) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Look for route file with Endpointer comment
        if (line.includes('ENDPOINTER') && line.includes('<backend>')) {
          // Check previous 3 lines for ENDPOINTER comment
          let hasEndpointer = false;
          for (let j = 1; j <= 3; j++) {
            if (i - j >= 0) {
              const prevLine = lines[i - j].trim();
              if (prevLine.includes('ENDPOINTER') && prevLine.includes('<backend>')) {
                hasEndpointer = true;
                break;
              }
            }
          }
          
          if (!hasEndpointer) {
            const relativePath = path.relative(routesFolder, filePath);
            violations.push(`${relativePath}:${i + 1}`);
          }
        }
      }
    }
    
    scanDirectory(routesFolder);
    
    if (violations.length > 0) {
      console.warn('\n⚠️  Found API route without Endpointer comment:\n');
      violations.forEach(v => console.warn(v));
      console.warn(`\nTotal violations: ${violations.length}`);
      throw new Error(`Found ${violations.length} API routes without Endpointer comment`);
    }
  });
});
