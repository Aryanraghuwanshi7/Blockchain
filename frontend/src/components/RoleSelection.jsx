import React from 'react';
import {
  Stethoscope,
  Building2,
  HeartHandshake,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  Lock,
  FileText,
  Award,
  Key,
  Users,
  CheckCircle2,
  HardDrive
} from 'lucide-react';

export default function RoleSelection({ onSelectRole, selectedRole, onContinue }) {
  const roles = [
    {
      id: 'patient',
      title: 'Patient',
      subtitle: 'Personal Health Records & Decryption',
      badge: 'Secure Access',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: HeartHandshake,
      iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      accentBorder: 'hover:border-emerald-400 group-hover:border-emerald-300',
      selectedRing: 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/20',
      description: 'Access, view, and decrypt medical records securely shared with you by doctors and healthcare institutions.',
      features: [
        'Access records in "Shared With Me"',
        'Client-side zero-knowledge decryption',
        'Verify certificate authenticity'
      ],
      defaultTab: 'shared'
    },
    {
      id: 'doctor',
      title: 'Doctor',
      subtitle: 'Clinical Practice & Certificate Authority',
      badge: 'Full Clinical Access',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: Stethoscope,
      iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
      accentBorder: 'hover:border-blue-400 group-hover:border-blue-300',
      selectedRing: 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/20',
      description: 'Encrypt and upload diagnostic reports, grant cryptographic access to patients/specialists, and issue blockchain certificates.',
      features: [
        'Upload & encrypt medical records (AES-256)',
        'Manage access permissions & re-wrap keys',
        'Issue tamper-proof certificates on-chain'
      ],
      defaultTab: 'upload'
    },
    {
      id: 'medicalStaff',
      title: 'Medical Staff',
      subtitle: 'Hospital Operations & Record Archives',
      badge: 'Records & Archive',
      badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
      icon: Building2,
      iconBg: 'bg-teal-50 text-teal-600 border-teal-100',
      accentBorder: 'hover:border-teal-400 group-hover:border-teal-300',
      selectedRing: 'ring-2 ring-teal-500 border-teal-500 bg-teal-50/20',
      description: 'Upload patient records, maintain hospital archives, manage access delegation, and verify document integrity.',
      features: [
        'Upload & pin records to IPFS',
        'Manage hospital document access',
        'Verify document hash on Ethereum ledger'
      ],
      defaultTab: 'upload'
    },
    {
      id: 'admin',
      title: 'Administrator',
      subtitle: 'System Governance & Access Control',
      badge: 'System Governance',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: ShieldAlert,
      iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      accentBorder: 'hover:border-indigo-400 group-hover:border-indigo-300',
      selectedRing: 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/20',
      description: 'Administer smart contract access control, onboard doctors & staff, and oversee decentralized ledger security.',
      features: [
        'Onboard & revoke healthcare practitioner roles',
        'Administer BlockDriveAccessControl contract',
        'Ledger auditing & system access controls'
      ],
      defaultTab: 'admin'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between text-slate-900">
      {/* Top Brand Bar */}
      <header className="bg-white border-b border-slate-200 py-3.5 px-6 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-slate-900 text-white rounded-md">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 tracking-tight">BlockDrive</span>
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded border border-slate-200">
                  Role Portal
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Decentralized Healthcare Access Control System</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline font-normal text-slate-600">ECDH & Smart Contract RBAC Active</span>
          </div>
        </div>
      </header>

      {/* Main Content: Role Selection */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 w-full flex-1 flex flex-col justify-center">
        <div className="text-center max-w-xl mx-auto mb-8 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-600 shadow-2xs mb-1">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Healthcare Identity Gateway</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            Choose Your Account Role
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-normal">
            Select your role to access your dedicated authentication portal and workspace.
          </p>
        </div>

        {/* 4 Role Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {roles.map((r) => {
            const Icon = r.icon;
            const isSelected = selectedRole === r.id;

            return (
              <div
                key={r.id}
                onClick={() => onSelectRole(r.id)}
                className={`group bg-white rounded-lg border p-4 sm:p-5 cursor-pointer flex flex-col justify-between transition-all duration-150 interactive-lift-subtle shadow-2xs ${
                  isSelected
                    ? r.selectedRing
                    : `border-slate-200 hover:border-slate-300 ${r.accentBorder}`
                }`}
              >
                <div className="space-y-3.5">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className={`p-2.5 rounded-md border ${r.iconBg}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${r.badgeClass}`}>
                      {r.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900">
                      {r.title}
                    </h3>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">
                      {r.subtitle}
                    </p>
                    <p className="text-xs text-slate-600 font-normal leading-relaxed mt-2">
                      {r.description}
                    </p>
                  </div>

                  {/* Role Capabilities */}
                  <div className="space-y-1.5 pt-3 border-t border-slate-100">
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                      Permissions
                    </span>
                    {r.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 text-xs text-slate-600 font-normal">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5 group-hover:text-slate-600" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Select Button */}
                <div className="pt-4 mt-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRole(r.id);
                      if (onContinue) onContinue(r.id);
                    }}
                    className={`w-full py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-700'
                    }`}
                  >
                    <span>{isSelected ? 'Continue as ' + r.title : 'Select ' + r.title}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Action Footer */}
        {selectedRole && (
          <div className="mt-7 text-center">
            <button
              onClick={() => onContinue(selectedRole)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white text-xs sm:text-sm font-medium rounded-md shadow-2xs transition-all duration-150 interactive-lift-subtle cursor-pointer"
            >
              <span>Proceed to {roles.find(r => r.id === selectedRole)?.title} Login</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3.5 text-center text-xs text-slate-400">
        BlockDrive Healthcare Network • Cryptographic Role-Based Access Control Architecture
      </footer>
    </div>
  );
}
