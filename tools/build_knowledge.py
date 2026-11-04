#!/usr/bin/env python3
"""Generates the "What I know" accordion (also the data source for the 3D map) and
writes it into index.html between the KNOWLEDGE markers. Run: python3 tools/build_knowledge.py

Grades are out of 10 and only listed where the owner provided them.
Project -> course edges are the courses each project drew on, kept deliberately conservative.
"""
import html
import pathlib
import re

DOMAINS = [
    ("signals", "Signals & information", [
        ("signals-systems", "Signals & Systems", None),
        ("stochastic", "Stochastic Signals & Processes", "8"),
        ("prob-stats", "Probability & Statistics", "8"),
        ("estimation", "Estimation & Detection Theory", "8.5"),
        ("time-series", "Time Series", None),
        ("dip", "Digital Image Processing", None),
        ("telecom", "Telecommunication Systems I & II", None),
        ("telecom-devices", "Applications of Telecom Devices", "9"),
    ]),
    ("ml", "Machine learning & computation", [
        ("pr-ml", "Pattern Recognition & Machine Learning", None),
        ("nn-dl", "Neural Networks & Deep Learning", "9.6"),
        ("ci", "Computational Intelligence", "9.5"),
        ("optimization", "Optimization Techniques", None),
        ("data-analysis", "Data Analysis", "10"),
        ("numerical", "Numerical Analysis", None),
        ("applied-math", "Applied Mathematics I & II", None),
        ("linear-algebra", "Linear Algebra", None),
    ]),
    ("bio", "Biomedical", [
        ("biomed-tech", "Biomedical Technology", "10"),
    ]),
    ("electronics", "Electronics & measurement", [
        ("electronics-1", "Electronics I", None),
        ("electronics-2", "Electronics II", "10"),
        ("measurement", "Measurement Systems", "10"),
        ("circuits", "Electric Circuits I & II", None),
        ("logic", "Logic Design", None),
        ("comp-org", "Computer Organization", None),
        ("em-fields", "Electromagnetic Fields I & II", None),
        ("materials", "Electrical Materials", None),
    ]),
    ("energy", "Energy & power", [
        ("power", "Power Systems I & II", None),
        ("renewable", "Renewable Energy Sources", "8.5"),
        ("dist-gen", "Distributed Generation", "10"),
        ("thermo", "Applied Thermodynamics", None),
    ]),
    ("control", "Control", [
        ("control-sys", "Automatic Control Systems I & II", None),
    ]),
    ("software", "Software & data systems", [
        ("structured", "Structured Programming", None),
        ("oop", "Object-Oriented Programming", "8.5"),
        ("data-structures", "Data Structures", None),
        ("algorithms", "Algorithm Analysis & Design", None),
        ("os", "Operating Systems", "8"),
        ("databases", "Databases", "8"),
        ("soft-eng", "Software Engineering I", "8"),
        ("networks", "Computer Networks I", "9"),
        ("network-theory", "Network Theory", "8"),
    ]),
    ("physics", "Physics", [
        ("physics-1", "Physics", None),
        ("quantum", "Quantum Physics", "10"),
    ]),
    ("econ", "Economics & ventures", [
        ("econ-principles", "Principles of Economics", None),
        ("investment", "Investment Evaluation", "10"),
    ]),
]

PROJECTS = [
    ("thesis", "Diploma thesis", "bio", "#thesis",
     "Wrist-PPG biomarkers for Parkinson's, graded 10/10: 249.3 M candidate windows through a four-stage quality gate to 101.3 M clean, 594 features per participant, +0.30 ROC-AUC over age and sex in all four models.",
     ["signals-systems", "stochastic", "prob-stats", "estimation", "time-series", "pr-ml", "data-analysis", "biomed-tech"]),
    ("tamu", "Texas A&M optical biosensing", "bio", "#p-tamu",
     "IRB-approved human-subjects study (2024): two PPG devices at chest, forehead and finger, three contact pressures, validated against a Masimo oximeter; first-author poster.",
     ["biomed-tech", "measurement", "electronics-2", "signals-systems", "data-analysis"]),
    ("fudan", "Fudan neural signals & DBS", "bio", "#p-grips",
     "GRIPS 2025: Python pipeline for clinical LFP recordings (Welch PSD, spectrograms, FOOOF) and 130 Hz DBS artifact removal; closed-loop neuromodulation system design.",
     ["signals-systems", "stochastic", "time-series", "biomed-tech", "control-sys"]),
    ("iftp", "Invent for the Planet 2022", "energy", "#p-iftp",
     "People's Choice among 25 teams: an anaerobic digester turning household organic waste into gas for building heating.",
     ["renewable", "thermo"]),
    ("artio", "ART.IO (founder)", "econ", "#ventures",
     "Founded a 3D virtual-tour venture and built the product and its website.",
     ["soft-eng", "econ-principles"]),
    ("elysium", "Elysium Retreat", "econ", "#ventures",
     "Own short-term rental since 2022: designed and built the website, run guest communication and operations.",
     ["soft-eng", "econ-principles"]),
]


def e(s):
    return html.escape(s, quote=True)


def build():
    course_domain = {cid: did for did, _, cs in DOMAINS for cid, _, _ in cs}
    out = ['<div class="km-list" data-km-list>']
    for did, label, courses in DOMAINS:
        projs = [p for p in PROJECTS if p[2] == did or any(course_domain.get(u) == did for u in p[5])]
        graded = [c for c in courses if c[2]]
        count = f'{len(courses)} course{"s" if len(courses) != 1 else ""}'
        if projs:
            count += f' · {len(projs)} project{"s" if len(projs) != 1 else ""}'
        out.append(f'  <details class="km-domain" data-domain="{did}" data-label="{e(label)}">')
        out.append(f'    <summary><span class="km-domain-name">{e(label)}</span><span class="km-count">{count}</span></summary>')
        out.append('    <ul class="km-courses">')
        for cid, name, grade in courses:
            g = f' data-grade="{grade}"' if grade else ''
            gs = f' <span class="km-grade">{grade}</span>' if grade else ''
            out.append(f'      <li data-id="{cid}"{g}><span>{e(name)}</span>{gs}</li>')
        out.append('    </ul>')
        if projs:
            links = ', '.join(f'<a href="{p[3]}">{e(p[1])}</a>' for p in projs)
            out.append(f'    <p class="km-used">Used in: {links}</p>')
        if graded:
            pass
        out.append('  </details>')
    out.append('  <ul class="km-projects-data" hidden>')
    for pid, name, home, href, evidence, uses in PROJECTS:
        out.append(f'    <li data-id="{pid}" data-domain="{home}" data-href="{href}" data-uses="{" ".join(uses)}" data-label="{e(name)}">{e(evidence)}</li>')
    out.append('  </ul>')
    out.append('</div>')
    return '\n'.join(out)


if __name__ == '__main__':
    root = pathlib.Path(__file__).resolve().parent.parent
    page = root / 'index.html'
    src = page.read_text()
    block = '<!-- KNOWLEDGE:START (generated by tools/build_knowledge.py) -->\n' + build() + '\n<!-- KNOWLEDGE:END -->'
    new, n = re.subn(r'<!-- KNOWLEDGE:START.*?<!-- KNOWLEDGE:END -->', block, src, flags=re.S)
    if n != 1:
        raise SystemExit('KNOWLEDGE markers not found exactly once')
    page.write_text(new)
    print('knowledge block written')
