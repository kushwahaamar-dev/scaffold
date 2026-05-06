#!/usr/bin/env tsx
import { App } from 'aws-cdk-lib';
import { ScaffoldStack } from '../lib/scaffold-stack.js';

const app = new App();

new ScaffoldStack(app, 'ScaffoldVerifierStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
