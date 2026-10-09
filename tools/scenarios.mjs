if (!process.env.DEEPSEEK_API_KEY) {
    console.error('未执行真实 DeepSeek 场景测试：DEEPSEEK_API_KEY 环境变量未配置。不会读取酒馆密钥文件。');
    process.exitCode = 2;
} else {
    console.error('完整场景运行器待阶段 4–5 接入；当前没有可据此宣称通过的模型场景。');
    process.exitCode = 2;
}
