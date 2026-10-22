import { mkdirSync, writeFileSync } from 'node:fs';
import { demoSchemaBundle } from './schemaBundle.mjs';
const directory = 'node_modules/.cache/dmp-demo';
mkdirSync(directory, { recursive: true });
const path = `${directory}/001-empty-schema.sql`;
writeFileSync(path, demoSchemaBundle());
console.log(`Instalador generado: ${path}`);
console.log('Solo estructura y configuración; no incluye seed.sql ni datos de la instalación actual.');
