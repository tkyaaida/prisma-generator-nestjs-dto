import fs from 'node:fs/promises';
import path from 'node:path';
import makeDir from 'make-dir';
import { generatorHandler } from '@prisma/generator-helper';
import { parseEnvValue } from '@prisma/internals';

import { run } from './generator';

import type { GeneratorOptions } from '@prisma/generator-helper';
import type { WriteableFileSpecs, NamingStyle } from './generator/types';

export const optionToBoolean = (
  input: string | string[] | undefined,
  defaultValue: boolean,
): boolean => {
  if (input === 'true') {
    return true;
  }
  if (input === 'false') {
    return false;
  }

  return defaultValue;
};

export const optionToString = (
  input: string | string[] | undefined,
  defaultValue: string,
): string => {
  if (typeof input === 'string') {
    return input;
  }
  if (Array.isArray(input)) {
    return input[0];
  }

  return defaultValue;
};

export const optionToFileNamingStyle = (
  input: string | string[] | undefined,
  defaultValue = 'camel',
): NamingStyle => {
  const supportedFileNamingStyles = ['kebab', 'camel', 'pascal', 'snake'];
  const isSupportedFileNamingStyle = (style: string): style is NamingStyle =>
    supportedFileNamingStyles.includes(style);
  const namingStyle = optionToString(input, defaultValue);

  if (!isSupportedFileNamingStyle(namingStyle)) {
    throw new Error(
      `'${input}' is not a valid file naming style. Valid options are ${supportedFileNamingStyles
        .map((s) => `'${s}'`)
        .join(', ')}.`,
    );
  }

  return namingStyle;
};

interface PrismaGeneratorNestjsDtoOptions {
  outputToNestJsResourceStructure: boolean;
  exportRelationModifierClasses: boolean;
  reExport: boolean;
  connectDtoPrefix: string;
  createDtoPrefix: string;
  updateDtoPrefix: string;
  dtoSuffix: string;
  entityPrefix: string;
  entitySuffix: string;
  fileNamingStyle: NamingStyle; // TODO: make it enum-like
}

export const parseGeneratorOptions = (
  options: GeneratorOptions,
): PrismaGeneratorNestjsDtoOptions => {
  const {
    outputToNestJsResourceStructure,
    exportRelationModifierClasses,
    reExport,
    connectDtoPrefix,
    createDtoPrefix,
    updateDtoPrefix,
    dtoSuffix,
    entityPrefix,
    entitySuffix,
    fileNamingStyle,
  } = options.generator.config;

  const config = {
    outputToNestJsResourceStructure: optionToBoolean(
      outputToNestJsResourceStructure,
      true,
    ),
    exportRelationModifierClasses: optionToBoolean(
      exportRelationModifierClasses,
      true,
    ),
    reExport: optionToBoolean(reExport, false),
    connectDtoPrefix: optionToString(connectDtoPrefix, 'Connect'),
    createDtoPrefix: optionToString(createDtoPrefix, 'Create'),
    updateDtoPrefix: optionToString(updateDtoPrefix, 'Update'),
    dtoSuffix: optionToString(dtoSuffix, 'Dto'),
    entityPrefix: optionToString(entityPrefix, ''),
    entitySuffix: optionToString(entitySuffix, ''),
    fileNamingStyle: optionToFileNamingStyle(fileNamingStyle),
  };
  return config;
};

export const generate = (options: GeneratorOptions) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const output = parseEnvValue(options.generator.output!);
  const config = parseGeneratorOptions(options);

  const results = run({
    output,
    dmmf: options.dmmf,
    ...config,
  });

  const indexCollections: Record<string, WriteableFileSpecs> = {};

  if (config.reExport) {
    results.forEach(({ fileName }) => {
      const dirName = path.dirname(fileName);

      const { [dirName]: fileSpec } = indexCollections;
      indexCollections[dirName] = {
        fileName: fileSpec?.fileName || path.join(dirName, 'index.ts'),
        content: [
          fileSpec?.content || '',
          `export * from './${path.basename(fileName, '.ts')}';`,
        ].join('\n'),
      };
    });
  }

  return Promise.all(
    results
      .concat(Object.values(indexCollections))
      .map(async ({ fileName, content }) => {
        await makeDir(path.dirname(fileName));
        return fs.writeFile(fileName, content);
      }),
  );
};

generatorHandler({
  onManifest: () => ({
    defaultOutput: '../src/generated/nestjs-dto',
    prettyName: 'NestJS DTO Generator',
  }),
  onGenerate: generate,
});
