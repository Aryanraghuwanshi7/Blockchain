import React from 'react';
import {
  Stethoscope,
  Building2,
  HeartHandshake,
  ShieldAlert,
  ArrowRight,
  HardDrive
} from 'lucide-react';

export default function RoleSelection({ onSelectRole, selectedRole, onContinue }) {
  const roles = [
    {
      id: 'patient',
      title: 'Patient',
      description: 'View and download medical records shared with you.',
      icon: HeartHandshake,
    },
    {
      id: 'doctor',
      title: 'Doctor',
      description: 'Upload and encrypt medical records, manage patient access.',
      icon: Stethoscope,
    },
    {
      id: 'medicalStaff',
      title: 'Medical Staff',
      description: 'Upload documents and maintain hospital records.',
      icon: Building2,
    },
    {
      id: 'admin',
      title: 'Administrator',
      description: 'Manage user accounts, roles, and system permissions.',
      icon: ShieldAlert,
    }
  ];

  const handleChoose = (roleId) => {
    onSelectRole(roleId);
    if (onContinue) {
      onContinue(roleId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between text-black font-sans">
      {/* Simple Header */}
      <header className="bg-white border-b border-gray-200 py-3 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gray-100 text-black border border-gray-200 rounded">
              <HardDrive className="w-4 h-4 text-black" />
            </div>
            <span className="font-semibold text-base text-black">BlockDrive</span>
          </div>
          <span className="text-xs text-black">Decentralized Healthcare Storage</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12 w-full flex-1 flex flex-col justify-center">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-black">Choose your role</h1>
          <p className="text-sm text-black mt-1">Select your account type to continue to login</p>
        </div>

        {/* 4 Clean Simple Role Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto w-full">
          {roles.map((r) => {
            const Icon = r.icon;
            const isSelected = selectedRole === r.id;

            return (
              <div
                key={r.id}
                onClick={() => handleChoose(r.id)}
                className={`bg-white border rounded-lg p-5 cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-gray-500 bg-gray-50/50 ring-1 ring-gray-400'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gray-100 text-black rounded">
                      <Icon className="w-5 h-5 text-black" />
                    </div>
                    <h2 className="text-base font-medium text-black">{r.title}</h2>
                  </div>
                  <p className="text-xs text-black leading-relaxed">{r.description}</p>
                </div>

                <div className="pt-4 mt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChoose(r.id);
                    }}
                    className={`w-full py-2 px-3 text-xs font-medium rounded border flex items-center justify-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'border-gray-400 bg-white text-black font-semibold shadow-xs'
                        : 'border-gray-300 bg-white hover:bg-gray-50 text-black'
                    }`}
                  >
                    <span>Continue as {r.title}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-black" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="bg-white border-t border-gray-200 py-3 text-center text-xs text-black">
        BlockDrive • Healthcare Access Control
      </footer>
    </div>
  );
}

