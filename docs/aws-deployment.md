# AWS deployment (frontend hosting)

How the CnE frontend gets from GitHub to users, what exists in AWS, and how to check it. The backend (database, sign-in, Realtime, the Add user function) runs on Supabase, not AWS; see [`supabase-setup.md`](supabase-setup.md).


## 1. The flow

```
git push to main
   -> GitHub Actions ("Deploy CnE", .github/workflows/deploy.yml)
        lint + build (needs the two VITE_ repository variables)
        signs in to AWS with a short-lived token (no stored AWS keys)
   -> S3 bucket (private)
   -> CloudFront (HTTPS, caching, security headers)
   -> users' browsers
```

Nothing in this flow stores an AWS access key. GitHub proves who it is to AWS with OpenID Connect, and AWS hands the workflow temporary credentials.

## 2. What exists

| Piece | Value |
|---|---|
| AWS region (bucket, role) | ap-southeast-1 |
| S3 bucket | `cne-frontend-103714492722-ap-southeast-1-an` |
| CloudFront distribution ID | `EU69SYHSXAKFS` |
| CloudFront domain | `d2gf3gjdolfs4d.cloudfront.net` |
| Custom domain | none yet |
| GitHub sign-in provider (IAM) | `token.actions.githubusercontent.com` |
| Deploy role | `cne-github-deploy` |
| Role's permissions policy | `cne-frontend-deploy` |
| SPA routing | a CloudFront Function that returns `index.html` for app routes. Name:| `cne-spa-routing` |
| Alarm | `cne-cloudfront-high-5xx` (region **us-east-1**, where CloudFront metrics live) |
| Alert topic (SNS) | `cne-monitoring-alerts` (email subscription, confirmed) |
| Budget | an AWS Budget with an email alert. Amount: $5 |

GitHub repository variables (Settings -> Secrets and variables -> Actions -> Variables): `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Only the publishable key belongs there. Never put the Supabase service-role key in GitHub variables or in any `VITE_` value.

## 3. Security settings (as set up on 2026-10-23)

- **MFA** is on for the root user and the IAM user. The root user has no access keys.
- **The bucket is private.** Opening the bucket's own address directly (`https://<bucket>.s3.ap-southeast-1.amazonaws.com/index.html`) returns Access Denied. Users only reach files through CloudFront.
- **CloudFront behavior (Default `*`):** viewer protocol is Redirect HTTP to HTTPS, cache policy is Managed-CachingOptimized, response headers policy is **Managed-SecurityHeadersPolicy**.
- **Headers sent on every response**, checked with `curl -I`: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` (plus the older `X-XSS-Protection`).
- **Not set yet:** a Content Security Policy. It needs to allow Supabase and the fonts, so add it first in report-only mode.
- **Bucket versioning** is on, with a lifecycle rule `expire-old-versions` that permanently deletes non-current versions after 30 days.

### Trust policy of `cne-github-deploy`

Only this repository's `main` branch can assume the role. The subject uses GitHub's immutable format (owner ID and repository ID), so deleting and recreating the repo means these two IDs must be updated.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::103714492722:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:Raltss@147219378/CnE@1427227915:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

### Permissions policy `cne-frontend-deploy`

The role can list and read/write files in the one bucket, and create and check cache invalidations on the one distribution. It cannot delete files, so the workflow's `aws s3 sync` runs without `--delete`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListFrontendBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::cne-frontend-103714492722-ap-southeast-1-an"
    },
    {
      "Sid": "ReadAndUploadFrontendFiles",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::cne-frontend-103714492722-ap-southeast-1-an/*"
    },
    {
      "Sid": "RefreshFrontendCache",
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"],
      "Resource": "arn:aws:cloudfront::103714492722:distribution/EU69SYHSXAKFS"
    }
  ]
}
```

## 4. Caching

The workflow sets the cache rules when it uploads:

- `assets/*` (file names contain a content hash): `public,max-age=31536000,immutable`. Browsers keep them for a year; a new build gets new names.
- `index.html` and everything else: `no-cache`, so browsers re-check every time and a new deploy shows up right away.
- Every deploy ends with a CloudFront invalidation of `/*`.

Browsers can show old response headers for the cached `assets/*` files. When checking headers, test the page itself or use `curl -I`.

## 5. Monitoring

- The alarm `cne-cloudfront-high-5xx` watches CloudFront's 5xx error rate (threshold 1%) and emails `cne-monitoring-alerts` when it goes into alarm. Missing data counts as not breaching, so quiet hours show OK.
- SNS is inside the free tier for this volume (first 1 million requests and 1,000 emails a month). The AWS Budget alert covers anything unexpected.
- The CloudFront console's metrics show traffic, error rates and cache hit rate.

## 6. Check it yourself

```bash
curl -I https://<your-cloudfront-domain>/          # security headers should be listed
curl -I https://<bucket>.s3.ap-southeast-1.amazonaws.com/index.html   # should be 403 Access Denied
```

In GitHub: Actions -> the latest "Deploy CnE" run should be green, including the "Sign in to AWS" step.

## 7. Rolling back a bad release

1. Normal way: `git revert` the bad commit, push to `main`. The workflow redeploys the old code.
2. Emergency way: in the S3 console, open the file with **Show versions** on, restore the previous version of `index.html`, then create a CloudFront invalidation for `/*`.

## 8. Not done yet

- A custom domain with HTTPS (Route 53 + an ACM certificate created in us-east-1). When added, update Supabase's **Site URL** to the new address.
- A Content Security Policy.
- This setup written as code (CloudFormation, CDK, or Terraform) so it can be rebuilt and reviewed.
- Confirm Supabase's **Site URL** points at the live address, not `http://localhost:5173`.
