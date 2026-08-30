import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadProof } from '../lib/cloudinary';
import { useAuth } from '../context/AuthContext';
import type { AppUser, HomeworkSubmission, HomeworkTask } from '../types';

// โมดูล 2: Admin สร้างวิชา/หัวข้อ/กำหนดส่ง · นักเรียนส่งรูปการบ้าน · Modal ตรวจหลักฐาน
// homework/{taskId} (db=primary) + subcollection submissions/{uid}

async function fetchTasks(): Promise<HomeworkTask[]> {
  const snap = await getDocs(collection(db, 'homework'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as HomeworkTask))
    .sort((a, b) => (a.deadline < b.deadline ? 1 : -1));
}

async function fetchSubmissions(taskId: string): Promise<HomeworkSubmission[]> {
  const snap = await getDocs(collection(db, 'homework', taskId, 'submissions'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as HomeworkSubmission));
}

async function fetchMySubmission(taskId: string, uid: string): Promise<HomeworkSubmission | null> {
  const ref = doc(db, 'homework', taskId, 'submissions', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? ({ uid: snap.id, ...snap.data() } as HomeworkSubmission) : null;
}

async function fetchStudents(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
    .filter((u) => u.role === 'student')
    .sort((a, b) => a.number - b.number);
}

function deadlineBadge(deadline: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (deadline < today) return <span className="status-chip danger">เลยกำหนด</span>;
  if (deadline === today) return <span className="status-chip pending">วันนี้</span>;
  return <span className="status-chip ok">ยังทัน</span>;
}

/** ฟอร์มสร้างงานใหม่ (Admin) */
function CreateTaskForm() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [deadline, setDeadline] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('missing');
      await addDoc(collection(db, 'homework'), {
        subject,
        title,
        detail,
        deadline,
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homework-tasks'] });
      setSubject('');
      setTitle('');
      setDetail('');
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-brand py-3 font-semibold text-white shadow-glass active:scale-95"
      >
        ➕ สร้างงานใหม่
      </button>
    );
  }

  return (
    <section className="glass-card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">สร้างงานใหม่</h2>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="วิชา"
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="หัวข้อ"
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      />
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="รายละเอียด"
        rows={2}
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      />
      <label className="text-sm text-gray-600">
        กำหนดส่ง
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-xl border border-gray-300 py-2 text-sm"
        >
          ยกเลิก
        </button>
        <button
          disabled={!subject || !title || create.isPending}
          onClick={() => create.mutate()}
          className="flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {create.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </section>
  );
}

/** Modal ตรวจหลักฐานของงานหนึ่งชิ้น (Admin) */
function SubmissionsModal({ task, onClose }: { task: HomeworkTask; onClose: () => void }) {
  const { data: students = [] } = useQuery({ queryKey: ['students'], queryFn: fetchStudents });
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['homework-submissions', task.id],
    queryFn: () => fetchSubmissions(task.id),
  });
  const queryClient = useQueryClient();
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: async (uid: string) => {
      const ref = doc(db, 'homework', task.id, 'submissions', uid);
      const current = submissions.find((s) => s.uid === uid);
      await setDoc(ref, { ...current, verified: true }, { merge: true });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['homework-submissions', task.id] }),
  });

  const byUid = new Map(submissions.map((s) => [s.uid, s]));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="glass-card max-h-[85vh] w-full max-w-md overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{task.title}</h2>
          <button onClick={onClose} className="text-gray-400" aria-label="ปิด">
            ✕
          </button>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-400">กำลังโหลด...</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {students.map((s) => {
              const sub = byUid.get(s.uid);
              return (
                <li
                  key={s.uid}
                  className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2"
                >
                  <span className="text-sm">
                    {s.number}. {s.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {sub ? (
                      <>
                        <button
                          onClick={() => setViewingUrl(sub.proofUrl)}
                          className="text-xs text-brand underline"
                        >
                          ดูรูป
                        </button>
                        {sub.verified ? (
                          <span className="status-chip ok">ตรวจแล้ว</span>
                        ) : (
                          <button
                            onClick={() => verify.mutate(s.uid)}
                            className="status-chip pending"
                          >
                            รอตรวจ · แตะเพื่อยืนยัน
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="status-chip danger">ยังไม่ส่ง</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {viewingUrl && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setViewingUrl(null)}
          >
            <img src={viewingUrl} alt="หลักฐานการบ้าน" className="max-h-[80vh] max-w-full rounded-xl" />
          </div>
        )}
      </div>
    </div>
  );
}

/** การ์ดงาน 1 ชิ้น มุมมองนักเรียน — อัปโหลดรูปการบ้าน */
function StudentTaskCard({ task }: { task: HomeworkTask }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const { data: mySubmission } = useQuery({
    queryKey: ['my-submission', task.id, profile?.uid],
    queryFn: () => fetchMySubmission(task.id, profile!.uid),
    enabled: !!profile,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile || !file) throw new Error('missing');
      const proofUrl = await uploadProof(file, 'homework');
      const ref = doc(db, 'homework', task.id, 'submissions', profile.uid);
      await setDoc(ref, {
        submittedAt: Timestamp.now().toMillis(),
        verified: false,
        proofUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-submission', task.id, profile?.uid] });
      setFile(null);
    },
  });

  return (
    <div className="glass-card p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-brand">{task.subject}</span>
        {deadlineBadge(task.deadline)}
      </div>
      <h3 className="font-semibold">{task.title}</h3>
      {task.detail && <p className="mt-1 text-sm text-gray-500">{task.detail}</p>}
      <p className="mt-1 text-xs text-gray-400">กำหนดส่ง {task.deadline}</p>

      {mySubmission ? (
        <div className="mt-3 flex items-center gap-2">
          {mySubmission.verified ? (
            <span className="status-chip ok">ตรวจแล้ว ✅</span>
          ) : (
            <span className="status-chip pending">ส่งแล้ว รอตรวจ ⏳</span>
          )}
          <a href={mySubmission.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-brand underline">
            ดูรูปที่ส่ง
          </a>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            disabled={!file || submit.isPending}
            onClick={() => submit.mutate()}
            className="rounded-xl bg-brand py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submit.isPending ? 'กำลังส่ง...' : 'ส่งรูปการบ้าน'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Homework() {
  const { profile } = useAuth();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['homework-tasks'],
    queryFn: fetchTasks,
  });
  const [modalTask, setModalTask] = useState<HomeworkTask | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-brand">📚 ติดตาม & ส่งงาน</h1>

      {profile?.role === 'admin' && <CreateTaskForm />}

      {isLoading ? (
        <p className="text-sm text-gray-400">กำลังโหลดรายการงาน...</p>
      ) : tasks.length === 0 ? (
        <div className="glass-card p-6 text-center text-sm text-gray-500">ยังไม่มีงานที่มอบหมาย</div>
      ) : profile?.role === 'admin' ? (
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <li key={t.id} className="glass-card flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-semibold text-brand">{t.subject}</p>
                <p className="font-semibold">{t.title}</p>
                <p className="text-xs text-gray-400">กำหนดส่ง {t.deadline}</p>
              </div>
              <button
                onClick={() => setModalTask(t)}
                className="rounded-xl bg-brand/10 px-3 py-2 text-sm font-semibold text-brand"
              >
                ตรวจงาน
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((t) => (
            <StudentTaskCard key={t.id} task={t} />
          ))}
        </div>
      )}

      {modalTask && <SubmissionsModal task={modalTask} onClose={() => setModalTask(null)} />}
    </div>
  );
}
