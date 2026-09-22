# Clinic CRM Web

Web dashboard for the Clinic CRM platform, built with Next.js (App Router), TypeScript, and Tailwind CSS.

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env.local` file in the root of the project with the following Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   *(Note: The service role key must NEVER be exposed here, only use it in server-side contexts like API routes if needed).*

3. **Run the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment

To deploy to Vercel:
1. Run `npx vercel login`
2. Run `npx vercel link` to connect this repository to a Vercel project.
3. Add the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` variables to your Vercel project settings.
4. Push to the `main` branch to trigger a deployment.


## Future Roadmap (Parked Ideas)

*   **Patient Engagement Automation:** Automated WhatsApp/SMS reminders (via Twilio/Meta API) for appointment confirmations and 24-hour reminders to reduce no-show rates.
*   **Automated Follow-ups:** Automatically flag patients who haven't visited in 6+ months for routine check-ups.
*   **Payment Gateways:** Razorpay/Stripe integration for generating payment links directly on invoices.
