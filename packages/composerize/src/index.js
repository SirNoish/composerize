// @flow

import 'core-js/fn/object/entries';

import yamljs from 'yamljs';
import parser from 'yargs-parser';
import deepmerge from 'deepmerge';

import { maybeGetComposeEntry, getComposeJson } from './logic';

export type RawValue = string | number | boolean | [string | number | boolean];

const getServiceName = (image: string): string => {
    let name = image.includes('/') ? image.split('/')[1] : image;
    name = name.includes(':') ? name.split(':')[0] : name;

    return name;
};

export default (input: string): ?string => {
    const formattedInput = input.replace(/(\s)+/g, ' ').trim();
    const parsedInput: {
        +_: Array<string>,
        +[flag: string]: RawValue,
    } = parser(formattedInput.replace(/^docker (run|create)/, ''), {
        configuration: { 'halt-at-non-option': true },
        boolean: ['i', 't', 'd', 'rm', 'privileged'],
    });
    const { _: command, ...params } = parsedInput;

    if (!formattedInput.startsWith('docker run') && !formattedInput.startsWith('docker create')) {
        throw new SyntaxError('must be a valid docker run/create command');
    }

    // The service object that we'll update
    let service = {};

    // Loop through the tokens and append to the service object
    Object.entries(params).forEach(([key, value]: [string, RawValue | mixed]) => {
        // https://github.com/facebook/flow/issues/2174
        // $FlowFixMe: Object.entries wipes out types ATOW
        const result = maybeGetComposeEntry(key, value);
        if (result) {
            const entries = Array.isArray(result) ? result : [result];
            entries.forEach((entry) => {
                // Store whatever the next entry will be
                const json = getComposeJson(entry);
                service = deepmerge(service, json);
            });
        }
    });

    const image = command[0];
    service.image = image;
    if (command.length > 1) {
        let argStart = 1;
        if (!command[1].startsWith('-')) {
            const cmd = command[1];
            service.command = cmd;
            argStart = 2;
        }
        if (argStart < command.length) {
            service.args = [];
            while (argStart < command.length) {
                service.args.push(command[argStart]);
                argStart += 1;
            }
        }
    }

    const serviceName = getServiceName(image);

    // Outer template
    const result = {
        version: '3.3',
        services: {
            [serviceName]: service,
        },
    };

    return yamljs.stringify(result, 9, 4).trim();
};
