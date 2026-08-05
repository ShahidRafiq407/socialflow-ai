"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { extractFromUrl } from "@/actions/extract";
import { createWorkspaceAction } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wand2 } from "lucide-react";

const formSchema = z.object({
  companyName: z.string().min(2, "Company name must be at least 2 characters."),
  industry: z.string().min(2, "Industry is required."),
  targetAudience: z.string().min(10, "Target audience description is too short."),
  brandTone: z.string().min(2, "Brand tone is required."),
});

export default function OnboardingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      industry: "",
      targetAudience: "",
      brandTone: "",
    },
  });

  const handleExtract = async () => {
    if (!url) return;
    setIsExtracting(true);
    try {
      const data = await extractFromUrl(url);
      form.reset({
        companyName: data.companyName,
        industry: data.industry,
        targetAudience: data.targetAudience,
        brandTone: data.brandTone,
      });
    } catch (error) {
      console.error(error);
      alert("Failed to extract data. Please try again or enter manually.");
    } finally {
      setIsExtracting(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      await createWorkspaceAction(values);
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      alert("Failed to create workspace.");
    }
  };

  return (
    <div className="container max-w-3xl mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Welcome! Let's set up your business profile.</CardTitle>
          <CardDescription>
            You can either auto-fill using your website or manually enter your details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="auto" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="auto">Auto-Fill with AI</TabsTrigger>
              <TabsTrigger value="manual">Manual Setup</TabsTrigger>
            </TabsList>

            <TabsContent value="auto">
              <div className="flex gap-2 mb-8">
                <Input
                  placeholder="https://yourwebsite.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <Button onClick={handleExtract} disabled={isExtracting || !url}>
                  {isExtracting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  Generate Magic Profile
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="manual">
              <div className="mb-8 text-sm text-muted-foreground">
                Please fill out the form below to configure your workspace.
              </div>
            </TabsContent>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Healthcare, SaaS" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="targetAudience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Audience</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Who are your customers?"
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="brandTone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand Tone</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Professional and friendly" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Complete Setup
                </Button>
              </form>
            </Form>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
