import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { AttributeType, Billing, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Distribution, ViewerProtocolPolicy, AllowedMethods, CachePolicy } from 'aws-cdk-lib/aws-cloudfront';
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

    // DynamoDB table for the score audit trail.
    const scores = new TableV2(this, 'ScoresTable', {
      tableName: 'scaffold-scores',
      partitionKey: { name: 'jobId', type: AttributeType.STRING },
      sortKey: { name: 'tickAt', type: AttributeType.NUMBER },
      billing: Billing.onDemand(),
    });

    const verifier = new NodejsFunction(this, 'VerifierFn', {
      runtime: Runtime.NODEJS_20_X,
      entry: '../agents/verifier-server.ts',
      handler: 'handler',
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        AWS_REGION: this.region,
        BEDROCK_MODEL: 'us.amazon.nova-pro-v1:0',
        SETTLE_ON_CHAIN: '0',
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
      },
    });
  }
}
