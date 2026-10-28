# Configure integrations

Admins manage integrations under **Integrations → App Catalog**. Choose a provider and select **Create**, enter a **Name** and its connection settings, choose the applicable services, then select **Create** on the form. Existing integrations use **Save** after editing. **Enable delivery** controls outgoing notifications; **Notify on recovery** adds recovery updates.

Use dedicated provider credentials with only the required permissions. Saved secrets are encrypted and are not returned to the browser; blank secret fields retain existing values when editing. Set the deployment's `APP_ORIGIN` to an address recipients can reach so incident links work outside the host computer.

## Slack and Microsoft Teams

- **Slack:** create an incoming webhook in Slack. Choose **Slack** in App Catalog and enter its `hooks.slack.com` URL in **Webhook URL**.
- **Microsoft Teams:** create a Teams Workflow with an externally accessible webhook trigger and an action that posts to the intended channel. Choose **Microsoft Teams** and enter the trigger URL in **Webhook URL**. Assign a co-owner to the workflow so it remains available when its creator leaves.

Both integrations send incident and recovery updates to their configured destination.

## ServiceNow

Choose **ServiceNow** and enter the instance root in **Instance Root URL**. Select **Basic Auth** with an integration username/password, or **OAuth · Client Credentials** with **Client ID**, **Client Secret**, and an optional scope. Enable the client credentials grant in ServiceNow if using OAuth.

Grant the integration account Incident table read/create/update access and access to read its own User record. After saving, **Test Saved Connection** checks read access and caller resolution without creating an incident. It does not prove create/update permissions. Recovery adds a work note; your ServiceNow workflow controls incident closure. See [operating details](operations.md#servicenow-authentication-and-caller-identity).

## PagerDuty

Create an Events API v2 integration for the destination service in PagerDuty. Choose **PagerDuty**, retain `https://events.pagerduty.com/v2/enqueue` in **Events API URL**, and enter the **Events API routing key**. Impact triggers an alert; recovery resolves the matching alert when recovery notifications are enabled.

## Jira Cloud and GitHub Issues

- **Jira Cloud:** enter the `https://TEAM.atlassian.net` root in **Instance Root URL**, then supply **Account email**, **API token**, **Project key**, and the numeric **Issue type ID**. The account needs browse, issue creation, and comment permissions.
- **GitHub Issues:** enter `https://api.github.com/repos/OWNER/REPO` in **Repository API URL**. Supply a fine-grained **Repository access token** with Issues read/write access to that repository.

These integrations create issues for incidents. Recovery adds a comment; it does not close the issue.

## Email

Choose **Email (SMTP)**, **SendGrid**, or **Amazon SES**. Enter **SMTP host**, **Encryption / port**, **Sender email**, credentials, and **Fallback recipients (comma-separated)**. Port 465 uses TLS; port 587 requires STARTTLS. Configure a sender authorized by your provider.

- **SendGrid:** use `smtp.sendgrid.net`, SMTP username `apikey`, and a SendGrid API key as the SMTP password. Verify the sender in SendGrid.
- **Amazon SES:** use the SMTP endpoint and SMTP credentials for your AWS region, not AWS access keys. Verify the sender. SES sandbox accounts can send only to verified recipients.

Enable **Notify the on-call responder when covered** if needed. **Send customer-facing incident comment emails** is a separate setting for eligible public comments; internal work notes do not send those emails.

## Discord and generic webhooks

- **Discord:** create a channel webhook, choose **Discord**, and enter its **Webhook URL**. Delivered messages suppress mentions.
- **Generic Webhook:** enter a public HTTPS **Webhook URL** and, if needed, a **Bearer token (optional)**. Your receiver should deduplicate requests using the delivery ID.

These are outgoing incident notifications. To receive external events into ServiceTrident, use the separate [external event API](external-api.md).

## Verify delivery

Review the integration delivery history and confirm receipt in the destination system. Check enabled delivery, service scope, credentials, provider permissions, and network reachability when a delivery fails. A successful connection test does not establish end-to-end delivery. **Retry Delivery** requires confirmation; a provider timeout can lead to duplicate notifications.
