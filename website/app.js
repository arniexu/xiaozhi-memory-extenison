const projectContent = {
	alpha: {
		query: '为什么当时选择了分层设计？',
		answer: '早期验证表明，分层设计能够隔离变化频繁的部分，让核心能力在不同环境中保持一致，并降低后续迁移成本。',
		source: '设计讨论 · 已验证结论 · 高置信度',
	},
	beta: {
		query: '上次性能问题最终是如何定位的？',
		answer: '排查记录将问题收敛到初始化阶段的重复请求。调整执行顺序后，关键路径恢复稳定，相关验证结果也被一并保留。',
		source: '问题复盘 · 验证记录 · 中等置信度',
	},
	gamma: {
		query: '这个功能有哪些尚未验证的边界？',
		answer: '现有证据只覆盖本地测试环境。真实部署、长时间运行和异常恢复仍需单独验证，因此结论保持为待确认状态。',
		source: '测试总结 · 待确认事项 · 低置信度',
	},
};

const query = document.getElementById('recallQuery');
const answer = document.getElementById('recallAnswer');
const source = document.getElementById('recallSource');

for (const button of document.querySelectorAll('.project')) {
	button.addEventListener('click', () => {
		const content = projectContent[button.dataset.project];
		if (!content) return;
		document.querySelector('.project.active')?.classList.remove('active');
		button.classList.add('active');
		for (const element of [query, answer, source]) element.animate([{ opacity: .15 }, { opacity: 1 }], { duration: 320 });
		query.textContent = content.query;
		answer.textContent = content.answer;
		source.textContent = content.source;
	});
}

const observer = new IntersectionObserver((entries) => {
	for (const entry of entries) {
		if (entry.isIntersecting) {
			entry.target.classList.add('visible');
			observer.unobserve(entry.target);
		}
	}
}, { threshold: .12 });

for (const element of document.querySelectorAll('.reveal')) observer.observe(element);