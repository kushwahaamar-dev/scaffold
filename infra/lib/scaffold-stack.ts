import { CfnParameter, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AttributeType, Billing, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Distribution, ViewerProtocolPolicy, AllowedMethods, CachePolicy, OriginRequestPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';

/**
 * AWS deployment topology for the Scaffold verifier:
 *
 *   CloudFront ──► API Gateway HTTP API ──► Lambda (verifier-server)
 *                                                │
 *                                                ├─► Bedrock InvokeModel (Claude/Nova)
 *                                                ├─► DynamoDB (job/score audit log)
 *                                                └─► Base RPC + ScaffoldEscrow.releaseStreamed
 *
 * The Lambda is identical to agents/verifier-server.ts — same Express handler,
 * wrapped via aws-lambda-web-adapter.
 */
export class ScaffoldStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const escrowAddress = new CfnParameter(this, 'EscrowAddress', {
      type: 'String', allowedPattern: '^0x[0-9a-fA-F]{40}$',
      description: 'Deployed current-version ScaffoldEscrow address.',
    });
    const arbiterPrivateKey = new CfnParameter(this, 'ArbiterPrivateKey', {
      type: 'String', noEcho: true, allowedPattern: '^0x[0-9a-fA-F]{64}$',
      description: 'Arbiter signer. Use a secrets integration instead of a parameter for production.',
    });
    const x402PayTo = new CfnParameter(this, 'X402PayTo', {
      type: 'String', allowedPattern: '^0x[0-9a-fA-F]{40}$',
      description: 'Address receiving x402 verification fees.',
    });
    const rpcUrl = new CfnParameter(this, 'RpcUrl', {
      type: 'String', default: 'https://sepolia.base.org',
    });

    // DynamoDB table for the score audit trail.
    const scores = new TableV2(this, 'ScoresTable', {
      tableName: 'scaffold-scores',
      partitionKey: { name: 'submissionId', type: AttributeType.STRING },
      billing: Billing.onDemand(),
    });

    const verifier = new NodejsFunction(this, 'VerifierFn', {
      runtime: Runtime.NODEJS_24_X,
      entry: '../agents/verifier-server.ts',
      projectRoot: '..',
      depsLockFilePath: '../package-lock.json',
      handler: 'handler',
      memorySize: 512,
      timeout: Duration.seconds(90),
      environment: {
        BEDROCK_MODEL: 'us.amazon.nova-pro-v1:0',
        SETTLE_ON_CHAIN: '1',
        CHAIN: 'base-sepolia',
        RPC_URL: rpcUrl.valueAsString,
        SCAFFOLD_ESCROW_ADDRESS: escrowAddress.valueAsString,
        ARBITER_PRIVATE_KEY: arbiterPrivateKey.valueAsString,
        X402_PAY_TO: x402PayTo.valueAsString,
        X402_NETWORK: 'base-sepolia',
        X402_FACILITATOR: 'https://x402.org/facilitator',
        SCORES_TABLE: scores.tableName,
      },
    });
    scores.grantReadWriteData(verifier);

    // Allow Bedrock InvokeModel for Claude + Nova model families.
    verifier.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:Converse'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-*`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-*`,
          `arn:aws:bedrock:*::foundation-model/anthropic.claude-*`,
          `arn:aws:bedrock:*::foundation-model/amazon.nova-*`,
        ],
      }),
    );
    verifier.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));

    const api = new HttpApi(this, 'VerifierApi');
    api.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('VerifierIntegration', verifier),
    });

    // Optional CloudFront distribution to put the Lambda@Edge-compatible
    // x402 paywall behind a global CDN. CloudFront forwards all methods +
    // the X-PAYMENT header, which is the relevant thing for x402.
    new Distribution(this, 'VerifierCdn', {
      defaultBehavior: {
        origin: new HttpOrigin(`${api.apiId}.execute-api.${this.region}.amazonaws.com`),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        // Explicitly forward X-PAYMENT and all other viewer headers while
        // replacing Host with the API Gateway origin host.
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
    });
  }
}
