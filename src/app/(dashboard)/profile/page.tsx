"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, User, ShieldAlert, Key } from "lucide-react";
import { formatId } from "@/lib/utils";

export default function ProfilePage() {
  const { user, staffProfile } = useAuth();

  const role = staffProfile?.role || "Staff";
  const name = staffProfile?.name || "Unknown User";

  // Define role permissions
  const doctorPermissions = [
    "Can create and edit patient profiles",
    "Can manage own schedule and appointments",
    "Can add clinical assessments and visit records",
    "Can upload lab reports and view patient history",
  ];

  const receptionistPermissions = [
    "Can create and edit patient profiles",
    "Can manage patient billing and invoices",
    "Can schedule appointments for all doctors",
    "Can manage clinic reception operations",
  ];

  const permissions = role.toLowerCase() === "doctor" ? doctorPermissions : receptionistPermissions;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Profile</h1>
        <p className="text-sm text-slate-500">View your personal details and system permissions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Personal Details */}
        <Card className="md:col-span-1 shadow-xs border-slate-200">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="size-5 text-blue-600" />
              User Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Full Name</p>
              <p className="font-semibold text-slate-900">{name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Email Address</p>
              <p className="text-slate-700">{user?.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">System Role</p>
              <Badge variant="outline" className="bg-slate-100 text-slate-800 capitalize font-medium px-2 py-0.5">
                {role}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Clinic Reference</p>
              <p className="text-xs font-mono text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100">
                {formatId("CLN", staffProfile?.clinic_id)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Permissions & Security */}
        <div className="md:col-span-2 flex flex-col gap-6">
          <Card className="shadow-xs border-slate-200">
            <CardHeader className="pb-4 border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldAlert className="size-5 text-teal-600" />
                Access Permissions
              </CardTitle>
              <CardDescription>
                Based on your role as a <span className="font-semibold capitalize text-slate-900">{role}</span>, you have the following permissions:
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {permissions.map((perm, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-700">{perm}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-slate-200">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Key className="size-5 text-amber-600" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500 mb-4">
                To update your password or authentication settings, please contact your Clinic Administrator.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
